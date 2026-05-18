const express = require('express');
const jwt = require('jsonwebtoken');
const { getConvertedClients } = require('../services/clientService');
const CrmContract = require('../models/CrmContract');
const CrmAmc = require('../models/CrmAmc');
const CrmPayment = require('../models/CrmPayment');
const CrmTicket = require('../models/CrmTicket');

const router = express.Router();

function requireCrmAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: 'CRM auth token required.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'crm_admin') {
      return res.status(403).json({ success: false, message: 'CRM admin role required.' });
    }
    req.crmUser = payload;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired CRM auth token.' });
  }
}

function scopedCompany(req) {
  return String(req.query.companyCode || req.body?.companyCode || req.crmUser?.companyCode || '').trim();
}

function makeDocumentNumber(type) {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${type}-${date}-${Math.floor(100000 + Math.random() * 900000)}`;
}

router.use(requireCrmAdmin);

router.get('/clients', async (req, res) => {
  try {
    const clients = await getConvertedClients({
      companyCode: scopedCompany(req),
      search: req.query.search,
    });
    return res.json({ success: true, clients, total: clients.length });
  } catch (err) {
    console.error('[crm clients]', err);
    return res.status(500).json({ success: false, message: 'Failed to load CRM clients.' });
  }
});

router.get('/contracts', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = {};
    if (companyCode) query.companyCode = companyCode;
    if (req.query.type) query.type = String(req.query.type).toUpperCase();
    if (req.query.clientCompanyName) query.clientCompanyName = req.query.clientCompanyName;

    const contracts = await CrmContract.find(query).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, contracts });
  } catch (err) {
    console.error('[crm contracts]', err);
    return res.status(500).json({ success: false, message: 'Failed to load contract history.' });
  }
});

router.post('/contracts/generate', async (req, res) => {
  try {
    const type = String(req.body?.type || '').toUpperCase();
    if (!['SLA', 'NDA'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Contract type must be SLA or NDA.' });
    }
    if (!req.body?.clientCompanyName) {
      return res.status(400).json({ success: false, message: 'Client company is required.' });
    }

    const clientCompanyName = String(req.body.clientCompanyName).trim();
    const documentNumber = makeDocumentNumber(type);
    const contract = await CrmContract.create({
      companyCode: scopedCompany(req),
      clientCompanyName,
      contactName: req.body.contactName || '',
      contactEmail: req.body.contactEmail || '',
      type,
      documentNumber,
      title: `${type} - ${clientCompanyName}`,
      status: 'Generated',
      effectiveFrom: req.body.effectiveFrom || new Date(),
      effectiveTo: req.body.effectiveTo || null,
      generatedBy: req.crmUser?.email || 'CRM Admin',
      content: req.body.content || `${type} generated for ${clientCompanyName}.`,
    });

    return res.status(201).json({ success: true, contract });
  } catch (err) {
    console.error('[crm contract generate]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate contract.' });
  }
});

router.get('/amc', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = companyCode ? { companyCode } : {};
    const [clients, records] = await Promise.all([
      getConvertedClients({ companyCode, search: req.query.search }),
      CrmAmc.find(query).sort({ renewalDate: 1, updatedAt: -1 }).lean(),
    ]);
    const recordsByClient = new Map(records.map((record) => [record.clientCompanyName.toLowerCase(), record]));
    const amc = clients.map((client) => ({
      clientCompanyName: client.companyName,
      companyCode: client.companyCode,
      status: client.amcStatus,
      renewalDate: recordsByClient.get(client.companyName.toLowerCase())?.renewalDate || null,
      outstandingAmount: recordsByClient.get(client.companyName.toLowerCase())?.outstandingAmount || 0,
      owner: recordsByClient.get(client.companyName.toLowerCase())?.owner || client.managers[0] || '',
      notes: recordsByClient.get(client.companyName.toLowerCase())?.notes || '',
    }));
    return res.json({ success: true, amc });
  } catch (err) {
    console.error('[crm amc]', err);
    return res.status(500).json({ success: false, message: 'Failed to load AMC tracking.' });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = companyCode ? { companyCode } : {};
    if (req.query.clientCompanyName) query.clientCompanyName = req.query.clientCompanyName;
    const payments = await CrmPayment.find(query).sort({ createdAt: -1 }).lean();
    const totalInvoiceAmount = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paidAmount = payments.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0);
    return res.json({
      success: true,
      payments,
      analytics: {
        totalInvoiceAmount,
        paidAmount,
        outstandingAmount: Math.max(totalInvoiceAmount - paidAmount, 0),
        paidInvoiceCount: payments.filter((item) => item.status === 'Paid').length,
      },
    });
  } catch (err) {
    console.error('[crm payments]', err);
    return res.status(500).json({ success: false, message: 'Failed to load payments.' });
  }
});

router.post('/payments/paid-invoice', async (req, res) => {
  try {
    if (!req.body?.clientCompanyName) {
      return res.status(400).json({ success: false, message: 'Client company is required.' });
    }
    const amount = Number(req.body.amount || req.body.paidAmount || 0);
    const payment = await CrmPayment.create({
      companyCode: scopedCompany(req),
      clientCompanyName: req.body.clientCompanyName,
      invoiceNumber: req.body.invoiceNumber || makeDocumentNumber('PAID-INV'),
      amount,
      paidAmount: Number(req.body.paidAmount || amount),
      status: 'Paid',
      paidAt: req.body.paidAt || new Date(),
      paymentMode: req.body.paymentMode || 'Manual',
      notes: req.body.notes || 'Paid invoice generated from CRM payments.',
    });
    return res.status(201).json({ success: true, payment });
  } catch (err) {
    console.error('[crm paid invoice]', err);
    return res.status(500).json({ success: false, message: 'Failed to generate paid invoice.' });
  }
});

router.get('/tickets', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = companyCode ? { companyCode } : {};
    if (req.query.clientCompanyName) query.clientCompanyName = req.query.clientCompanyName;
    const tickets = await CrmTicket.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, tickets });
  } catch (err) {
    console.error('[crm tickets]', err);
    return res.status(500).json({ success: false, message: 'Failed to load tickets.' });
  }
});

router.post('/tickets', async (req, res) => {
  try {
    if (!req.body?.clientCompanyName || !req.body?.subject) {
      return res.status(400).json({ success: false, message: 'Client company and subject are required.' });
    }
    const ticket = await CrmTicket.create({
      companyCode: scopedCompany(req),
      clientCompanyName: req.body.clientCompanyName,
      subject: req.body.subject,
      query: req.body.query || '',
      priority: req.body.priority || 'Medium',
      status: req.body.status || 'Open',
      raisedBy: req.body.raisedBy || req.crmUser?.email || '',
    });
    return res.status(201).json({ success: true, ticket });
  } catch (err) {
    console.error('[crm ticket create]', err);
    return res.status(500).json({ success: false, message: 'Failed to create ticket.' });
  }
});

router.get('/projects', (req, res) => {
  return res.json({
    success: true,
    projects: [],
    message: 'Project management is reserved for the next CRM phase.',
  });
});

module.exports = router;

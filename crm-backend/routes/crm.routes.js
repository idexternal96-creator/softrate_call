const express = require('express');
const jwt = require('jsonwebtoken');
const { getConvertedClients } = require('../services/clientService');
const CrmContract = require('../models/CrmContract');
const CrmAmc = require('../models/CrmAmc');
const CrmPayment = require('../models/CrmPayment');
const CrmProject = require('../models/CrmProject');
const CrmTicket = require('../models/CrmTicket');
const { fetchHostingerDomains } = require('../services/hostingerService');
const {
  addYears,
  clientSuggestionsForDomain,
  lifecycleStatusFor,
  nextAnnualRenewalDate,
  normalizeDomainName,
  serializeAmcRecord,
} = require('../services/amcService');

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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringValue(value) {
  return String(value || '').trim();
}

function amcViewFilter(row, view) {
  const filter = String(view || 'all').toLowerCase();
  if (filter === 'paid') return row.status === 'Paid';
  if (filter === 'unpaid') return row.status === 'Unpaid';
  if (filter === 'upcoming') return row.status === 'Upcoming Renewals';
  if (filter === 'blocked') return row.status === 'Blocked';
  return true;
}

function amcAnalytics(rows) {
  return rows.reduce((summary, row) => {
    if (row.status === 'Paid') summary.paid += 1;
    if (row.status === 'Upcoming Renewals') summary.upcoming += 1;
    if (row.status === 'Unpaid') summary.unpaid += 1;
    if (row.status === 'Blocked') summary.blocked += 1;
    return summary;
  }, { paid: 0, unpaid: 0, upcoming: 0, blocked: 0 });
}

function projectPayload(body = {}, companyCode = '', crmUser = {}) {
  return {
    companyCode,
    clientCompanyName: stringValue(body.clientCompanyName),
    clientStatus: stringValue(body.clientStatus) || 'Converted',
    projectManagerName: stringValue(body.projectManagerName),
    projectManagerPhone: stringValue(body.projectManagerPhone),
    projectManagerEmail: stringValue(body.projectManagerEmail),
    projectManagerRole: 'project_manager',
    status: stringValue(body.status) || 'Assigned',
    notes: stringValue(body.notes),
    mappedBy: crmUser.email || '',
  };
}

function buildRecordQuery({ companyCode, clientCompanyName, domainName }) {
  const clauses = [];
  if (clientCompanyName) clauses.push({ companyCode, clientCompanyName });
  if (domainName) clauses.push({ companyCode, domainName });
  return clauses.length > 1 ? { $or: clauses } : clauses[0];
}

async function findAmcRecord({ id, companyCode, clientCompanyName, domainName }) {
  if (id) return CrmAmc.findById(id);
  const query = buildRecordQuery({ companyCode, clientCompanyName, domainName });
  return query ? CrmAmc.findOne(query) : null;
}

async function saveAmcRecordFromPayload(payload, crmUser = {}) {
  const companyCode = String(payload.companyCode || crmUser.companyCode || '').trim();
  const clientCompanyName = String(payload.clientCompanyName || '').trim();
  const domainName = normalizeDomainName(payload.domainName);
  if (!clientCompanyName) {
    const error = new Error('Client company is required.');
    error.statusCode = 400;
    throw error;
  }

  const domainPurchaseDate = parseDate(payload.domainPurchaseDate);
  const renewalDate = parseDate(payload.renewalDate) || nextAnnualRenewalDate(domainPurchaseDate);
  const record = await findAmcRecord({
    id: payload.id || payload._id,
    companyCode,
    clientCompanyName,
    domainName,
  }) || new CrmAmc({ companyCode, clientCompanyName });
  const previousPaymentStatus = record.paymentStatus;

  record.companyCode = companyCode;
  record.clientCompanyName = clientCompanyName;
  if (domainName) record.domainName = domainName;
  if (payload.hostingerDomainId !== undefined) record.hostingerDomainId = String(payload.hostingerDomainId || '').trim();
  if (payload.hostingerStatus !== undefined) record.hostingerStatus = String(payload.hostingerStatus || '').trim();
  if (payload.hostingerExpiresAt !== undefined) record.hostingerExpiresAt = parseDate(payload.hostingerExpiresAt);
  if (domainPurchaseDate) record.domainPurchaseDate = domainPurchaseDate;
  if (renewalDate) record.renewalDate = renewalDate;
  record.annualFee = numberValue(payload.annualFee, record.annualFee || 0);
  record.owner = String(payload.owner || record.owner || '').trim();
  record.notes = String(payload.notes || record.notes || '').trim();
  record.source = payload.source || record.source || 'manual';

  const requestedStatus = String(payload.paymentStatus || payload.status || '').trim();
  if (['Paid', 'Unpaid'].includes(requestedStatus)) {
    record.paymentStatus = requestedStatus;
    record.outstandingAmount = requestedStatus === 'Paid'
      ? 0
      : numberValue(payload.outstandingAmount, record.annualFee || record.outstandingAmount || 0);
    if (requestedStatus === 'Paid' && previousPaymentStatus !== 'Paid') {
      record.lastPaidAt = new Date();
      record.lastPaidRenewalDate = record.renewalDate || null;
      if (record.renewalDate) record.renewalDate = addYears(record.renewalDate, 1);
      record.blocked = false;
      record.blockedAt = undefined;
      record.blockedBy = '';
      record.blockReason = '';
    }
  } else {
    record.outstandingAmount = numberValue(payload.outstandingAmount, record.outstandingAmount || 0);
  }

  if (payload.blockClient || requestedStatus === 'Blocked') {
    record.blocked = true;
    record.blockedAt = new Date();
    record.blockedBy = crmUser.email || '';
    record.blockReason = String(payload.blockReason || 'Manual AMC block').trim();
    record.paymentStatus = 'Unpaid';
  }

  record.status = lifecycleStatusFor(record);
  await record.save();
  return record;
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

router.get('/amc/hostinger/domains', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const [clients, records] = await Promise.all([
      getConvertedClients({ companyCode, search: req.query.search }),
      CrmAmc.find(companyCode ? { companyCode } : {}).lean(),
    ]);
    const domains = await fetchHostingerDomains({ includeDetails: true });
    const recordsByDomain = new Map(records.map((record) => [normalizeDomainName(record.domainName), record]));

    return res.json({
      success: true,
      domains: domains.map((domain) => {
        const existing = recordsByDomain.get(domain.domainName);
        const suggestions = clientSuggestionsForDomain(domain.domainName, clients);
        return {
          ...domain,
          existingMapping: existing ? serializeAmcRecord(existing) : null,
          suggestions,
        };
      }),
    });
  } catch (err) {
    console.error('[crm amc hostinger domains]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode === 503 ? err.message : 'Failed to fetch Hostinger domains.',
    });
  }
});

router.post('/amc/hostinger/import', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
    const mappingByDomain = new Map(mappings.map((item) => [normalizeDomainName(item.domainName), item]));
    const autoMap = req.body?.autoMap !== false;
    const [clients, domains] = await Promise.all([
      getConvertedClients({ companyCode }),
      fetchHostingerDomains({ includeDetails: true }),
    ]);

    const imported = [];
    const unmapped = [];

    for (const domain of domains) {
      const explicitMapping = mappingByDomain.get(domain.domainName);
      const suggestions = clientSuggestionsForDomain(domain.domainName, clients);
      const suggestedClient = suggestions[0]?.score >= 85 ? suggestions[0] : null;
      const clientCompanyName = String(explicitMapping?.clientCompanyName || (autoMap ? suggestedClient?.clientCompanyName : '') || '').trim();

      if (!clientCompanyName) {
        unmapped.push({ ...domain, suggestions });
        continue;
      }

      const mappedClient = clients.find((client) => client.companyName === clientCompanyName);
      const record = await saveAmcRecordFromPayload({
        companyCode: mappedClient?.companyCode || companyCode,
        clientCompanyName,
        domainName: domain.domainName,
        hostingerDomainId: domain.hostingerDomainId,
        hostingerStatus: domain.hostingerStatus,
        hostingerExpiresAt: domain.hostingerExpiresAt,
        domainPurchaseDate: domain.domainPurchaseDate,
        annualFee: explicitMapping?.annualFee,
        owner: explicitMapping?.owner || mappedClient?.managers?.[0] || '',
        source: 'hostinger',
      }, req.crmUser);

      record.lastImportedAt = new Date();
      record.mappedAt = record.mappedAt || new Date();
      record.mappedBy = record.mappedBy || req.crmUser?.email || '';
      record.status = lifecycleStatusFor(record);
      await record.save();
      imported.push(serializeAmcRecord(record));
    }

    return res.json({
      success: true,
      imported,
      unmapped,
      message: `${imported.length} Hostinger domain${imported.length === 1 ? '' : 's'} imported. ${unmapped.length} left unmapped.`,
    });
  } catch (err) {
    console.error('[crm amc hostinger import]', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode === 503 ? err.message : 'Failed to import Hostinger domains.',
    });
  }
});

router.get('/amc', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = { domainName: { $exists: true, $nin: ['', null] } };
    if (companyCode) query.companyCode = companyCode;
    const searchValue = String(req.query.search || '').trim().toLowerCase();
    const [clients, records] = await Promise.all([
      getConvertedClients({ companyCode }),
      CrmAmc.find(query).sort({ renewalDate: 1, updatedAt: -1 }).lean(),
    ]);

    const clientsByName = new Map(clients.map((client) => [String(client.companyName || '').toLowerCase(), client]));
    const allRows = records
      .filter((record) => clientsByName.has(String(record.clientCompanyName || '').toLowerCase()))
      .map((record) => {
        const client = clientsByName.get(String(record.clientCompanyName || '').toLowerCase());
        return serializeAmcRecord({
          ...record,
          clientCompanyName: client?.companyName || record.clientCompanyName,
          companyCode: client?.companyCode || record.companyCode,
          owner: record.owner || client?.managers?.[0] || '',
        });
      })
      .filter((row) => !searchValue
        || String(row.clientCompanyName || '').toLowerCase().includes(searchValue)
        || String(row.domainName || '').toLowerCase().includes(searchValue)
        || String(row.owner || '').toLowerCase().includes(searchValue));
    const amc = allRows.filter((row) => amcViewFilter(row, req.query.view));

    return res.json({ success: true, amc, analytics: amcAnalytics(allRows) });
  } catch (err) {
    console.error('[crm amc]', err);
    return res.status(500).json({ success: false, message: 'Failed to load AMC tracking.' });
  }
});

router.patch('/amc', async (req, res) => {
  try {
    const record = await saveAmcRecordFromPayload({
      ...req.body,
      companyCode: scopedCompany(req),
    }, req.crmUser);
    return res.json({ success: true, amc: serializeAmcRecord(record) });
  } catch (err) {
    console.error('[crm amc update]', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to update AMC tracking.' });
  }
});

router.patch('/amc/:id/status', async (req, res) => {
  try {
    const record = await CrmAmc.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'AMC record not found.' });
    const paymentStatus = String(req.body?.paymentStatus || '').trim();
    if (!['Paid', 'Unpaid'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'paymentStatus must be Paid or Unpaid.' });
    }

    record.paymentStatus = paymentStatus;
    if (paymentStatus === 'Paid') {
      record.outstandingAmount = 0;
      record.lastPaidAt = new Date();
      record.lastPaidRenewalDate = record.renewalDate || null;
      if (record.renewalDate) record.renewalDate = addYears(record.renewalDate, 1);
      record.blocked = false;
      record.blockedAt = undefined;
      record.blockedBy = '';
      record.blockReason = '';
    } else {
      record.outstandingAmount = numberValue(req.body?.outstandingAmount, record.annualFee || record.outstandingAmount || 0);
    }
    record.status = lifecycleStatusFor(record);
    await record.save();
    return res.json({ success: true, amc: serializeAmcRecord(record) });
  } catch (err) {
    console.error('[crm amc status]', err);
    return res.status(500).json({ success: false, message: 'Failed to update AMC payment status.' });
  }
});

router.patch('/amc/:id/block', async (req, res) => {
  try {
    const record = await CrmAmc.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'AMC record not found.' });
    if (!serializeAmcRecord(record).canManualBlock) {
      return res.status(400).json({ success: false, message: 'Manual block is available only for unpaid AMC records in the last 3 days before renewal or overdue.' });
    }

    record.blocked = true;
    record.blockedAt = new Date();
    record.blockedBy = req.crmUser?.email || '';
    record.blockReason = String(req.body?.reason || 'Manual AMC block').trim();
    record.paymentStatus = 'Unpaid';
    record.status = 'Blocked';
    await record.save();

    return res.json({ success: true, amc: serializeAmcRecord(record) });
  } catch (err) {
    console.error('[crm amc block]', err);
    return res.status(500).json({ success: false, message: 'Failed to block AMC domain.' });
  }
});

router.delete('/amc/:id', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = { _id: req.params.id };
    if (companyCode) query.companyCode = companyCode;
    const record = await CrmAmc.findOneAndDelete(query).lean();
    if (!record) return res.status(404).json({ success: false, message: 'AMC mapping not found.' });
    return res.json({ success: true, message: 'AMC mapping removed.' });
  } catch (err) {
    console.error('[crm amc delete]', err);
    return res.status(500).json({ success: false, message: 'Failed to remove AMC mapping.' });
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

router.get('/projects', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = companyCode ? { companyCode } : {};
    if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
    const projects = await CrmProject.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, projects });
  } catch (err) {
    console.error('[crm projects]', err);
    return res.status(500).json({ success: false, message: 'Failed to load project mappings.' });
  }
});

router.post('/projects/map', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const payload = projectPayload(req.body, companyCode, req.crmUser);
    if (!payload.clientCompanyName || !payload.projectManagerName) {
      return res.status(400).json({ success: false, message: 'Converted client and project manager are required.' });
    }

    const clients = await getConvertedClients({ companyCode });
    const client = clients.find((item) => item.companyName.toLowerCase() === payload.clientCompanyName.toLowerCase());
    if (!client) {
      return res.status(400).json({ success: false, message: 'Only converted clients can be mapped to a project manager.' });
    }

    payload.clientCompanyName = client.companyName;
    payload.clientStatus = client.status || payload.clientStatus;

    const project = await CrmProject.findOneAndUpdate(
      { companyCode, clientCompanyName: payload.clientCompanyName },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ success: true, project });
  } catch (err) {
    console.error('[crm project map]', err);
    return res.status(500).json({ success: false, message: 'Failed to save project manager mapping.' });
  }
});

router.patch('/projects/:id/status', async (req, res) => {
  try {
    const status = stringValue(req.body?.status);
    if (!status) return res.status(400).json({ success: false, message: 'Project status is required.' });

    const project = await CrmProject.findByIdAndUpdate(
      req.params.id,
      { $set: { status, notes: stringValue(req.body?.notes) } },
      { new: true, runValidators: true }
    ).lean();

    if (!project) return res.status(404).json({ success: false, message: 'Project mapping not found.' });
    return res.json({ success: true, project });
  } catch (err) {
    console.error('[crm project status]', err);
    return res.status(500).json({ success: false, message: 'Failed to update project status.' });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const companyCode = scopedCompany(req);
    const query = { _id: req.params.id };
    if (companyCode) query.companyCode = companyCode;
    const project = await CrmProject.findOneAndDelete(query).lean();
    if (!project) return res.status(404).json({ success: false, message: 'Project mapping not found.' });
    return res.json({ success: true, message: 'Project mapping removed.' });
  } catch (err) {
    console.error('[crm project delete]', err);
    return res.status(500).json({ success: false, message: 'Failed to remove project mapping.' });
  }
});

module.exports = router;

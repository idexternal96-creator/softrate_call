const express = require('express');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Lead = require('../models/Lead');
const User = require('../models/User');

const router = express.Router();

function normalize(value) {
  return String(value || '').trim();
}

function getConvertedStatuses(user) {
  const configured = Array.isArray(user?.convertedPageStatuses) ? user.convertedPageStatuses : [];
  return configured.length ? configured : ['Converted'];
}

function isConvertedLead(lead, user) {
  return getConvertedStatuses(user)
    .map((status) => normalize(status).toLowerCase())
    .includes(normalize(lead?.status).toLowerCase());
}

async function generateInvoiceNumber(companyCode, invoiceDate) {
  const date = invoiceDate ? new Date(invoiceDate) : new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `Invoice_${yy}${mm}`;
  const count = await Invoice.countDocuments({
    companyCode,
    invoiceNumber: new RegExp(`^${prefix}\\d{3}_v\\d+$`),
  });
  return `${prefix}${String(count + 1).padStart(3, '0')}_v1`;
}

function buildLineItems(rawItems, gstPercentage) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const rate = Math.max(0, Number(item.rate ?? item.price ?? 0));
      const taxable = rate * quantity;
      const gst = taxable * (Number(gstPercentage || 0) / 100);
      return {
        productId: mongoose.Types.ObjectId.isValid(item.productId || item.product?._id)
          ? item.productId || item.product?._id
          : null,
        name: normalize(item.name || item.product?.name || 'Service'),
        sacHsn: normalize(item.sacHsn || item.product?.sacHsn || ''),
        quantity,
        rate,
        taxable,
        cgst: gst / 2,
        sgst: gst / 2,
        total: taxable + gst,
      };
    })
    .filter((item) => item.name && item.rate > 0);
}

async function findInvoiceLead(body) {
  const companyCode = normalize(body.companyCode);
  const leadId = normalize(body.leadId);
  if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
    const lead = await Lead.findOne({ _id: leadId, companyCode, isArchived: { $ne: true } });
    if (lead) return lead;
  }

  const contactNumber = normalize(body.contactNumber);
  if (contactNumber) {
    return Lead.findOne({ companyCode, contactNumber, isArchived: { $ne: true } });
  }

  return null;
}

router.post('/', async (req, res) => {
  try {
    const companyCode = normalize(req.body.companyCode);
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }

    const user = await User.findOne({ companyCode });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Company settings not found.' });
    }

    const lead = await findInvoiceLead(req.body);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found for invoice.' });
    }

    if (!isConvertedLead(lead, user)) {
      return res.status(400).json({
        success: false,
        message: 'Invoices can only be generated for converted leads.',
      });
    }

    const gstPercentage = Number(req.body.gstPercentage ?? user.gstPercentage ?? 18);
    const items = buildLineItems(req.body.items, gstPercentage);
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'At least one invoice item is required.' });
    }

    const subtotal = items.reduce((sum, item) => sum + item.taxable, 0);
    const gstAmount = items.reduce((sum, item) => sum + item.cgst + item.sgst, 0);
    const invoiceDate = req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date();
    const invoiceNumber = await generateInvoiceNumber(companyCode, invoiceDate);

    const invoice = await Invoice.create({
      companyCode,
      employeePhone: normalize(req.body.employeePhone || lead.assignedEmployeePhone),
      employeeName: normalize(req.body.employeeName),
      leadId: lead._id,
      leadCompanyName: lead.leadCompanyName,
      contactName: lead.contactName,
      contactNumber: lead.contactNumber,
      directorEmailAddress: lead.directorEmailAddress,
      invoiceNumber,
      versionNo: 1,
      items,
      subtotal,
      gstPercentage,
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      gstAmount,
      total: subtotal + gstAmount,
      invoiceDate,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      createdByRole: req.body.createdByRole === 'admin' ? 'admin' : 'employee',
      createdByName: normalize(req.body.createdByName || req.body.employeeName),
      createdByPhone: normalize(req.body.createdByPhone || req.body.employeePhone),
      companySnapshot: {
        name: user.showCompanyNameOnInvoice === false ? '' : user.companyName,
        logo: user.invoiceLogo || '',
        gstNumber: user.gstNumber || '',
        registeredAddress: user.invoiceRegisteredAddress || user.companyAddress || '',
        phone: user.contactDetails?.phone || '',
        email: user.contactDetails?.email || '',
        website: user.contactDetails?.website || '',
        footer: user.invoiceFooter || '',
      },
      clientSnapshot: {
        companyName: lead.leadCompanyName,
        contactName: lead.contactName,
        phone: lead.contactNumber,
        email: lead.directorEmailAddress,
      },
    });

    return res.status(201).json({ success: true, invoice });
  } catch (err) {
    console.error('Create invoice error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save invoice.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const companyCode = normalize(req.query.companyCode);
    if (!companyCode) {
      return res.status(400).json({ success: false, message: 'companyCode is required.' });
    }

    const filter = { companyCode };
    const employeePhone = normalize(req.query.employeePhone);
    if (employeePhone) filter.employeePhone = employeePhone;

    const search = normalize(req.query.search);
    if (search) {
      filter.$or = [
        { invoiceNumber: new RegExp(search, 'i') },
        { leadCompanyName: new RegExp(search, 'i') },
        { contactName: new RegExp(search, 'i') },
        { contactNumber: new RegExp(search, 'i') },
        { directorEmailAddress: new RegExp(search, 'i') },
      ];
    }

    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;
    if (dateFrom || dateTo) {
      filter.invoiceDate = {};
      if (dateFrom) filter.invoiceDate.$gte = dateFrom;
      if (dateTo) {
        dateTo.setHours(23, 59, 59, 999);
        filter.invoiceDate.$lte = dateTo;
      }
    }

    const invoices = await Invoice.find(filter).sort({ invoiceDate: -1, createdAt: -1 }).limit(300).lean();
    return res.json({ success: true, invoices });
  } catch (err) {
    console.error('List invoices error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch invoices.' });
  }
});

module.exports = router;

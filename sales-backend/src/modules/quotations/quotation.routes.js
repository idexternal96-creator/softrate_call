const express = require('express');
const mongoose = require('mongoose');
const Quotation = require('../../../models/Quotation');
const Lead = require('../../../models/Lead');
const User = require('../../../models/User');
const { parsePageQuery, buildPageResponse } = require('../../common/pagination/pagination');

const router = express.Router();

function normalize(value) {
  return String(value || '').trim();
}

async function findLead(body) {
  const companyCode = normalize(body.companyCode);
  const leadId = normalize(body.leadId);
  if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
    const lead = await Lead.findOne({ _id: leadId, companyCode, isArchived: { $ne: true } });
    if (lead) return lead;
  }
  const contactNumber = normalize(body.contactNumber);
  if (contactNumber) return Lead.findOne({ companyCode, contactNumber, isArchived: { $ne: true } });
  return null;
}

async function generateQuotationNumber(companyCode, quotationDate) {
  const date = quotationDate ? new Date(quotationDate) : new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `QT-${yy}${mm}`;
  const count = await Quotation.countDocuments({
    companyCode,
    quotationNumber: new RegExp(`^${prefix}\\d{3}$`),
  });
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

function buildItems(rawItems, gstPercentage) {
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
        quantity,
        rate,
        taxable,
        gst,
        total: taxable + gst,
      };
    })
    .filter((item) => item.name && item.rate >= 0);
}

router.post('/', async (req, res) => {
  try {
    const companyCode = normalize(req.body.companyCode);
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode is required.' });

    const user = await User.findOne({ companyCode });
    if (!user) return res.status(404).json({ success: false, message: 'Company settings not found.' });

    const lead = await findLead(req.body);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found for quotation.' });

    const gstPercentage = Number(req.body.gstPercentage ?? user.gstPercentage ?? 18);
    const items = buildItems(req.body.items, gstPercentage);
    if (!items.length) return res.status(400).json({ success: false, message: 'At least one quotation item is required.' });

    const subtotal = items.reduce((sum, item) => sum + item.taxable, 0);
    const gstAmount = items.reduce((sum, item) => sum + item.gst, 0);
    const quotationDate = req.body.quotationDate ? new Date(req.body.quotationDate) : new Date();
    const quotationNumber = await generateQuotationNumber(companyCode, quotationDate);

    const quotation = await Quotation.create({
      companyCode,
      employeePhone: normalize(req.body.employeePhone || lead.assignedEmployeePhone),
      employeeName: normalize(req.body.employeeName),
      leadId: lead._id,
      leadCompanyName: lead.leadCompanyName,
      contactName: lead.contactName,
      contactNumber: lead.contactNumber,
      directorEmailAddress: lead.directorEmailAddress,
      quotationNumber,
      items,
      subtotal,
      gstPercentage,
      gstAmount,
      total: subtotal + gstAmount,
      quotationDate,
      createdByRole: req.body.createdByRole === 'admin' ? 'admin' : 'employee',
      createdByName: normalize(req.body.createdByName || req.body.employeeName),
      createdByPhone: normalize(req.body.createdByPhone || req.body.employeePhone),
      companySnapshot: {
        name: user.showCompanyNameOnInvoice === false ? '' : user.companyName,
        logo: user.invoiceLogo || '',
        registeredAddress: user.invoiceRegisteredAddress || user.companyAddress || '',
        phone: user.contactDetails?.phone || '',
        email: user.contactDetails?.email || '',
        website: user.contactDetails?.website || '',
        footer: user.invoiceFooter || '',
      },
    });

    return res.status(201).json({ success: true, quotation });
  } catch (err) {
    console.error('Create quotation error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save quotation.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const companyCode = normalize(req.query.companyCode);
    if (!companyCode) return res.status(400).json({ success: false, message: 'companyCode is required.' });

    const filter = { companyCode };
    const employeePhone = normalize(req.query.employeePhone);
    if (employeePhone) filter.employeePhone = employeePhone;

    const search = normalize(req.query.search);
    if (search) {
      filter.$or = [
        { quotationNumber: new RegExp(search, 'i') },
        { leadCompanyName: new RegExp(search, 'i') },
        { contactName: new RegExp(search, 'i') },
        { contactNumber: new RegExp(search, 'i') },
        { directorEmailAddress: new RegExp(search, 'i') },
      ];
    }

    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;
    if (dateFrom || dateTo) {
      filter.quotationDate = {};
      if (dateFrom) filter.quotationDate.$gte = dateFrom;
      if (dateTo) {
        dateTo.setHours(23, 59, 59, 999);
        filter.quotationDate.$lte = dateTo;
      }
    }

    const pagination = parsePageQuery(req.query);
    const [total, quotations] = await Promise.all([
      Quotation.countDocuments(filter),
      Quotation.find(filter)
        .sort({ quotationDate: -1, createdAt: -1 })
        .skip(pagination.isPaginated ? pagination.skip : 0)
        .limit(pagination.isPaginated ? pagination.pageSize : 300)
        .lean(),
    ]);

    const page = buildPageResponse({
      items: quotations,
      total,
      page: pagination.page,
      pageSize: pagination.isPaginated ? pagination.pageSize : quotations.length,
    });

    return res.json({
      success: true,
      quotations: page.items,
      items: page.items,
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      hasMore: page.hasMore,
    });
  } catch (err) {
    console.error('List quotations error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch quotations.' });
  }
});

module.exports = router;

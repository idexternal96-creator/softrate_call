const express = require('express');
const {
  FinanceBankEntry,
  FinanceExpense,
  FinancePayrollRun,
  FinancePurchaseOrder,
  FinanceSettings,
  FinanceTaxRecord,
  FinanceVendor,
  FinanceVendorBill,
  financeNavigation,
  getBanking,
  getDashboard,
  getExpenses,
  getIncomeStreams,
  getPayables,
  getPayroll,
  getReceivables,
  getReports,
  getTax,
  normalize,
  toNumber,
} = require('../services/finance.service');

const router = express.Router();

function companyCode(req) {
  return normalize(req.query.companyCode || req.body?.companyCode);
}

function requireCompanyCode(req, res, next) {
  if (!companyCode(req)) {
    return res.status(400).json({ success: false, message: 'companyCode is required.' });
  }
  return next();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function makeDocumentNumber(prefix) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Math.max(1, toNumber(item.quantity, 1));
      const rate = Math.max(0, toNumber(item.rate));
      return {
        name: normalize(item.name || 'Item'),
        quantity,
        rate,
        total: quantity * rate,
      };
    })
    .filter((item) => item.name && item.total >= 0);
}

function sendError(res, err, fallback) {
  console.error(fallback, err);
  return res.status(err.statusCode || 500).json({ success: false, message: err.message || fallback });
}

router.get('/health', (req, res) => {
  res.json({ success: true, service: 'finance-backend', status: 'OK' });
});

router.get('/navigation', (req, res) => {
  res.json({ success: true, navigation: financeNavigation() });
});

router.get('/dashboard', requireCompanyCode, async (req, res) => {
  try {
    return res.json(await getDashboard(companyCode(req), req.query));
  } catch (err) {
    return sendError(res, err, 'Failed to load finance dashboard.');
  }
});

router.get('/income-streams', requireCompanyCode, async (req, res) => {
  try {
    return res.json(await getIncomeStreams(companyCode(req), req.query));
  } catch (err) {
    return sendError(res, err, 'Failed to load income streams.');
  }
});

async function receivablesHandler(req, res) {
  try {
    return res.json(await getReceivables(companyCode(req), req.params.view || 'invoices', req.query));
  } catch (err) {
    return sendError(res, err, 'Failed to load receivables.');
  }
}

router.get('/receivables', requireCompanyCode, receivablesHandler);
router.get('/receivables/:view', requireCompanyCode, receivablesHandler);

async function payablesHandler(req, res) {
  try {
    return res.json(await getPayables(companyCode(req), req.params.view || 'vendor-bills'));
  } catch (err) {
    return sendError(res, err, 'Failed to load payables.');
  }
}

router.get('/payables', requireCompanyCode, payablesHandler);
router.get('/payables/:view', requireCompanyCode, payablesHandler);

async function expensesHandler(req, res) {
  try {
    return res.json(await getExpenses(companyCode(req), req.params.view || 'company-expenses'));
  } catch (err) {
    return sendError(res, err, 'Failed to load expenses.');
  }
}

router.get('/expenses', requireCompanyCode, expensesHandler);
router.get('/expenses/:view', requireCompanyCode, expensesHandler);

async function payrollHandler(req, res) {
  try {
    return res.json(await getPayroll(companyCode(req), req.params.view || 'payroll-runs'));
  } catch (err) {
    return sendError(res, err, 'Failed to load payroll.');
  }
}

router.get('/payroll', requireCompanyCode, payrollHandler);
router.get('/payroll/:view', requireCompanyCode, payrollHandler);

async function taxHandler(req, res) {
  try {
    return res.json(await getTax(companyCode(req), req.params.view || 'gst'));
  } catch (err) {
    return sendError(res, err, 'Failed to load tax records.');
  }
}

router.get('/tax', requireCompanyCode, taxHandler);
router.get('/tax/:view', requireCompanyCode, taxHandler);

async function bankingHandler(req, res) {
  try {
    return res.json(await getBanking(companyCode(req), req.params.view || 'cash-flow'));
  } catch (err) {
    return sendError(res, err, 'Failed to load banking records.');
  }
}

router.get('/banking', requireCompanyCode, bankingHandler);
router.get('/banking/:view', requireCompanyCode, bankingHandler);

async function reportsHandler(req, res) {
  try {
    return res.json(await getReports(companyCode(req), req.params.view || 'profit-loss'));
  } catch (err) {
    return sendError(res, err, 'Failed to load finance reports.');
  }
}

router.get('/reports', requireCompanyCode, reportsHandler);
router.get('/reports/:view', requireCompanyCode, reportsHandler);

router.get('/settings', requireCompanyCode, async (req, res) => {
  try {
    const settings = await FinanceSettings.findOne({ companyCode: companyCode(req) }).lean()
      || new FinanceSettings({ companyCode: companyCode(req) }).toObject();
    return res.json({ success: true, settings });
  } catch (err) {
    return sendError(res, err, 'Failed to load finance settings.');
  }
});

router.patch('/settings', requireCompanyCode, async (req, res) => {
  try {
    const settings = await FinanceSettings.findOneAndUpdate(
      { companyCode: companyCode(req) },
      { $set: req.body, $setOnInsert: { companyCode: companyCode(req) } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ success: true, settings });
  } catch (err) {
    return sendError(res, err, 'Failed to update finance settings.');
  }
});

router.get('/vendors', requireCompanyCode, async (req, res) => {
  try {
    const vendors = await FinanceVendor.find({ companyCode: companyCode(req) }).sort({ name: 1 }).lean();
    return res.json({ success: true, vendors });
  } catch (err) {
    return sendError(res, err, 'Failed to load vendors.');
  }
});

router.post('/vendors', requireCompanyCode, async (req, res) => {
  try {
    const vendor = await FinanceVendor.create({
      companyCode: companyCode(req),
      name: normalize(req.body.name),
      category: normalize(req.body.category) || 'Service Vendor',
      gstNumber: normalize(req.body.gstNumber),
      contactName: normalize(req.body.contactName),
      phone: normalize(req.body.phone),
      email: normalize(req.body.email).toLowerCase(),
      paymentTerms: normalize(req.body.paymentTerms) || 'Net 15',
      status: req.body.status === 'Inactive' ? 'Inactive' : 'Active',
    });
    return res.status(201).json({ success: true, vendor });
  } catch (err) {
    return sendError(res, err, 'Failed to save vendor.');
  }
});

router.post('/payables/vendor-bills', requireCompanyCode, async (req, res) => {
  try {
    const amount = toNumber(req.body.amount);
    const taxAmount = toNumber(req.body.taxAmount);
    const tdsDeducted = toNumber(req.body.tdsDeducted);
    const bill = await FinanceVendorBill.create({
      companyCode: companyCode(req),
      vendorId: req.body.vendorId || null,
      vendorName: normalize(req.body.vendorName || req.body.name),
      billNumber: normalize(req.body.billNumber) || makeDocumentNumber('BILL'),
      serviceType: normalize(req.body.serviceType) || 'Operations',
      billDate: parseDate(req.body.billDate) || new Date(),
      dueDate: parseDate(req.body.dueDate),
      amount,
      taxAmount,
      tdsDeducted,
      netPayable: toNumber(req.body.netPayable, amount + taxAmount - tdsDeducted),
      paidAmount: toNumber(req.body.paidAmount),
      status: normalize(req.body.status) || 'Pending Approval',
      paymentReference: normalize(req.body.paymentReference),
      notes: normalize(req.body.notes),
    });
    return res.status(201).json({ success: true, bill });
  } catch (err) {
    return sendError(res, err, 'Failed to save vendor bill.');
  }
});

router.patch('/payables/vendor-bills/:id', requireCompanyCode, async (req, res) => {
  try {
    const bill = await FinanceVendorBill.findOneAndUpdate(
      { _id: req.params.id, companyCode: companyCode(req) },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!bill) return res.status(404).json({ success: false, message: 'Vendor bill not found.' });
    return res.json({ success: true, bill });
  } catch (err) {
    return sendError(res, err, 'Failed to update vendor bill.');
  }
});

router.post('/payables/purchase-orders', requireCompanyCode, async (req, res) => {
  try {
    const items = normalizeItems(req.body.items);
    const subtotal = items.reduce((total, item) => total + item.total, 0);
    const taxAmount = toNumber(req.body.taxAmount);
    const purchaseOrder = await FinancePurchaseOrder.create({
      companyCode: companyCode(req),
      poNumber: normalize(req.body.poNumber) || makeDocumentNumber('PO'),
      requesterName: normalize(req.body.requesterName),
      department: normalize(req.body.department) || 'Operations',
      vendorName: normalize(req.body.vendorName),
      purpose: normalize(req.body.purpose),
      items,
      subtotal,
      taxAmount,
      totalAmount: toNumber(req.body.totalAmount, subtotal + taxAmount),
      status: normalize(req.body.status) || 'Requested',
      expectedDeliveryDate: parseDate(req.body.expectedDeliveryDate),
      approvedBy: normalize(req.body.approvedBy),
    });
    return res.status(201).json({ success: true, purchaseOrder });
  } catch (err) {
    return sendError(res, err, 'Failed to save purchase order.');
  }
});

router.patch('/payables/purchase-orders/:id', requireCompanyCode, async (req, res) => {
  try {
    const purchaseOrder = await FinancePurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, companyCode: companyCode(req) },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!purchaseOrder) return res.status(404).json({ success: false, message: 'Purchase order not found.' });
    return res.json({ success: true, purchaseOrder });
  } catch (err) {
    return sendError(res, err, 'Failed to update purchase order.');
  }
});

router.post('/expenses', requireCompanyCode, async (req, res) => {
  try {
    const expense = await FinanceExpense.create({
      companyCode: companyCode(req),
      type: normalize(req.body.type) || 'Company Expense',
      category: normalize(req.body.category) || 'Miscellaneous',
      employeeName: normalize(req.body.employeeName),
      department: normalize(req.body.department),
      vendorName: normalize(req.body.vendorName),
      description: normalize(req.body.description),
      expenseDate: parseDate(req.body.expenseDate) || new Date(),
      amount: toNumber(req.body.amount),
      taxAmount: toNumber(req.body.taxAmount),
      reimbursable: !!req.body.reimbursable,
      status: normalize(req.body.status) || 'Submitted',
      receiptUrl: normalize(req.body.receiptUrl),
    });
    return res.status(201).json({ success: true, expense });
  } catch (err) {
    return sendError(res, err, 'Failed to save expense.');
  }
});

router.patch('/expenses/:id', requireCompanyCode, async (req, res) => {
  try {
    const expense = await FinanceExpense.findOneAndUpdate(
      { _id: req.params.id, companyCode: companyCode(req) },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    return res.json({ success: true, expense });
  } catch (err) {
    return sendError(res, err, 'Failed to update expense.');
  }
});

router.post('/payroll/runs', requireCompanyCode, async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const normalizedItems = items.map((item) => {
      const gross = toNumber(item.basicSalary) + toNumber(item.hra) + toNumber(item.allowances);
      const deductions = toNumber(item.deductions) + toNumber(item.tds) + toNumber(item.pf) + toNumber(item.esi);
      const reimbursements = toNumber(item.reimbursements);
      return {
        ...item,
        employeeName: normalize(item.employeeName),
        gross,
        netSalary: toNumber(item.netSalary, gross - deductions + reimbursements),
      };
    });
    const grossAmount = normalizedItems.reduce((total, item) => total + toNumber(item.basicSalary) + toNumber(item.hra) + toNumber(item.allowances), 0);
    const deductions = normalizedItems.reduce((total, item) => total + toNumber(item.deductions) + toNumber(item.tds) + toNumber(item.pf) + toNumber(item.esi), 0);
    const reimbursements = normalizedItems.reduce((total, item) => total + toNumber(item.reimbursements), 0);
    const payrollRun = await FinancePayrollRun.create({
      companyCode: companyCode(req),
      runNumber: normalize(req.body.runNumber) || makeDocumentNumber('PAY'),
      month: normalize(req.body.month) || new Date().toISOString().slice(0, 7),
      freezeDate: parseDate(req.body.freezeDate),
      processedAt: parseDate(req.body.processedAt),
      items: normalizedItems,
      grossAmount: toNumber(req.body.grossAmount, grossAmount),
      deductions: toNumber(req.body.deductions, deductions),
      reimbursements: toNumber(req.body.reimbursements, reimbursements),
      netPayable: toNumber(req.body.netPayable, grossAmount - deductions + reimbursements),
      status: normalize(req.body.status) || 'Draft',
    });
    return res.status(201).json({ success: true, payrollRun });
  } catch (err) {
    return sendError(res, err, 'Failed to save payroll run.');
  }
});

router.patch('/payroll/runs/:id', requireCompanyCode, async (req, res) => {
  try {
    const payrollRun = await FinancePayrollRun.findOneAndUpdate(
      { _id: req.params.id, companyCode: companyCode(req) },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!payrollRun) return res.status(404).json({ success: false, message: 'Payroll run not found.' });
    return res.json({ success: true, payrollRun });
  } catch (err) {
    return sendError(res, err, 'Failed to update payroll run.');
  }
});

router.post('/tax/records', requireCompanyCode, async (req, res) => {
  try {
    const taxRecord = await FinanceTaxRecord.create({
      companyCode: companyCode(req),
      type: normalize(req.body.type) || 'GST Collected',
      period: normalize(req.body.period) || new Date().toISOString().slice(0, 7),
      source: normalize(req.body.source) || 'Manual',
      taxableAmount: toNumber(req.body.taxableAmount),
      taxAmount: toNumber(req.body.taxAmount),
      status: normalize(req.body.status) || 'Draft',
      dueDate: parseDate(req.body.dueDate),
      filedAt: parseDate(req.body.filedAt),
    });
    return res.status(201).json({ success: true, taxRecord });
  } catch (err) {
    return sendError(res, err, 'Failed to save tax record.');
  }
});

router.post('/banking/entries', requireCompanyCode, async (req, res) => {
  try {
    const bankEntry = await FinanceBankEntry.create({
      companyCode: companyCode(req),
      entryDate: parseDate(req.body.entryDate) || new Date(),
      bankAccount: normalize(req.body.bankAccount) || 'Primary Bank',
      direction: normalize(req.body.direction) || 'Inflow',
      amount: toNumber(req.body.amount),
      reference: normalize(req.body.reference),
      matchedType: normalize(req.body.matchedType) || 'Other',
      matchedRecordId: normalize(req.body.matchedRecordId),
      status: normalize(req.body.status) || 'Unmatched',
      notes: normalize(req.body.notes),
    });
    return res.status(201).json({ success: true, bankEntry });
  } catch (err) {
    return sendError(res, err, 'Failed to save banking entry.');
  }
});

router.patch('/banking/entries/:id', requireCompanyCode, async (req, res) => {
  try {
    const bankEntry = await FinanceBankEntry.findOneAndUpdate(
      { _id: req.params.id, companyCode: companyCode(req) },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();
    if (!bankEntry) return res.status(404).json({ success: false, message: 'Bank entry not found.' });
    return res.json({ success: true, bankEntry });
  } catch (err) {
    return sendError(res, err, 'Failed to update banking entry.');
  }
});

module.exports = router;

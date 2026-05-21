const Invoice = require('../../sales-backend/models/Invoice');
const Payment = require('../../sales-backend/models/Payment');
const CrmPayment = require('../../crm-backend/models/CrmPayment');
const CrmAmc = require('../../crm-backend/models/CrmAmc');
const CrmProject = require('../../crm-backend/models/CrmProject');
const FinanceVendor = require('../models/FinanceVendor');
const FinanceVendorBill = require('../models/FinanceVendorBill');
const FinancePurchaseOrder = require('../models/FinancePurchaseOrder');
const FinanceExpense = require('../models/FinanceExpense');
const FinancePayrollRun = require('../models/FinancePayrollRun');
const FinanceTaxRecord = require('../models/FinanceTaxRecord');
const FinanceBankEntry = require('../models/FinanceBankEntry');
const FinanceSettings = require('../models/FinanceSettings');

function normalize(value) {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value = new Date()) {
  const date = parseDate(value) || new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = parseDate(value) || new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function monthKey(value) {
  const date = parseDate(value) || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(value, amount) {
  const date = parseDate(value) || new Date();
  date.setMonth(date.getMonth() + amount);
  return date;
}

function dateRangeFromQuery(query = {}) {
  return {
    from: parseDate(query.from || query.dateFrom),
    to: query.to || query.dateTo ? endOfDay(query.to || query.dateTo) : null,
  };
}

function withinRange(value, range = {}) {
  const date = parseDate(value);
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function companyQuery(companyCode) {
  const code = normalize(companyCode);
  return code ? { companyCode: code } : {};
}

function daysBetween(from, to = new Date()) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function agingBucket(days) {
  if (days <= 0) return 'Current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function upcomingWithin(value, days) {
  const date = parseDate(value);
  if (!date) return false;
  const today = startOfDay();
  const target = startOfDay(date);
  const max = startOfDay();
  max.setDate(max.getDate() + days);
  return target >= today && target <= max;
}

function salesInvoiceStatus(invoice) {
  return String(invoice.paymentStatus || '').toLowerCase() === 'paid' ? 'Paid' : 'Unpaid';
}

function serializeSalesInvoice(invoice) {
  const total = toNumber(invoice.total);
  const status = salesInvoiceStatus(invoice);
  const paidAmount = status === 'Paid' ? total : 0;
  const balanceAmount = Math.max(total - paidAmount, 0);
  const dueDate = parseDate(invoice.dueDate);
  const daysOverdue = dueDate && balanceAmount > 0 ? Math.max(daysBetween(dueDate), 0) : 0;
  return {
    id: String(invoice._id || ''),
    source: 'sales',
    stream: 'Sales Invoice',
    companyCode: invoice.companyCode || '',
    clientName: invoice.leadCompanyName || invoice.clientSnapshot?.companyName || '',
    invoiceNumber: invoice.invoiceNumber || '',
    invoiceDate: invoice.invoiceDate || invoice.createdAt,
    dueDate: invoice.dueDate || null,
    taxableAmount: toNumber(invoice.subtotal),
    gstAmount: toNumber(invoice.gstAmount),
    totalAmount: total,
    paidAmount,
    balanceAmount,
    paymentStatus: status,
    status: balanceAmount > 0 && dueDate && dueDate < new Date() ? 'Overdue' : status,
    daysOverdue,
    agingBucket: agingBucket(daysOverdue),
    owner: invoice.employeeName || invoice.createdByName || '',
    contactName: invoice.contactName || '',
    contactNumber: invoice.contactNumber || '',
    email: invoice.directorEmailAddress || '',
  };
}

function serializeCrmPayment(payment) {
  const total = toNumber(payment.amount);
  const paidAmount = toNumber(payment.paidAmount);
  const balanceAmount = Math.max(total - paidAmount, 0);
  const status = payment.status || (balanceAmount <= 0 ? 'Paid' : 'Pending');
  return {
    id: String(payment._id || ''),
    source: 'crm',
    stream: 'CRM Client Payment',
    companyCode: payment.companyCode || '',
    clientName: payment.clientCompanyName || '',
    invoiceNumber: payment.invoiceNumber || '',
    invoiceDate: payment.createdAt,
    dueDate: null,
    taxableAmount: total,
    gstAmount: 0,
    totalAmount: total,
    paidAmount,
    balanceAmount,
    paymentStatus: status,
    status,
    daysOverdue: status === 'Overdue' ? 1 : 0,
    agingBucket: status === 'Overdue' ? '1-30' : 'Current',
    paymentMode: payment.paymentMode || '',
    paidAt: payment.paidAt || null,
    notes: payment.notes || '',
  };
}

function serializeAmc(amc) {
  const paid = String(amc.paymentStatus || '').toLowerCase() === 'paid';
  const amount = toNumber(amc.annualFee || amc.outstandingAmount);
  const outstanding = paid ? 0 : toNumber(amc.outstandingAmount, amount);
  const renewalDate = parseDate(amc.renewalDate);
  const daysUntilRenewal = renewalDate
    ? Math.ceil((startOfDay(renewalDate).getTime() - startOfDay().getTime()) / (1000 * 60 * 60 * 24))
    : null;
  return {
    id: String(amc._id || ''),
    source: 'crm',
    stream: 'AMC Renewal',
    companyCode: amc.companyCode || '',
    clientName: amc.clientCompanyName || '',
    domainName: amc.domainName || '',
    renewalDate: amc.renewalDate || null,
    annualFee: amount,
    totalAmount: amount,
    paidAmount: paid ? amount : 0,
    balanceAmount: outstanding,
    paymentStatus: paid ? 'Paid' : 'Unpaid',
    status: amc.status || (paid ? 'Paid' : 'Unpaid'),
    owner: amc.owner || '',
    daysUntilRenewal,
    outstandingAmount: outstanding,
    paidAt: amc.lastPaidAt || null,
    notes: amc.notes || '',
  };
}

function serializeSubscriptionPayment(payment) {
  const amount = toNumber(payment.amount) / 100;
  return {
    id: String(payment._id || ''),
    source: 'sales',
    stream: 'Workspace Subscription',
    companyCode: payment.companyCode || '',
    clientName: payment.pendingSignup?.companyName || payment.companyCode || '',
    totalAmount: amount,
    paidAmount: payment.status === 'paid' ? amount : 0,
    balanceAmount: payment.status === 'paid' ? 0 : amount,
    paymentStatus: payment.status || 'created',
    paymentMethod: payment.paymentMethod || '',
    paidAt: payment.updatedAt || payment.createdAt,
    fromDate: payment.fromDate,
    toDate: payment.toDate,
  };
}

function sum(rows, selector) {
  return rows.reduce((total, row) => total + toNumber(selector(row)), 0);
}

function groupByMonth(rows, selector, dateSelector) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => monthKey(addMonths(now, index - 5)));
  const grouped = new Map(months.map((key) => [key, 0]));
  rows.forEach((row) => {
    const key = monthKey(dateSelector(row));
    if (grouped.has(key)) grouped.set(key, grouped.get(key) + toNumber(selector(row)));
  });
  return months.map((key) => ({ month: key, amount: grouped.get(key) || 0 }));
}

async function getFinanceCollections(companyCode) {
  const query = companyQuery(companyCode);
  const [
    invoices,
    crmPayments,
    amcRecords,
    subscriptionPayments,
    vendors,
    vendorBills,
    purchaseOrders,
    expenses,
    payrollRuns,
    taxRecords,
    bankEntries,
    projects,
    settings,
  ] = await Promise.all([
    Invoice.find(query).sort({ invoiceDate: -1, createdAt: -1 }).lean(),
    CrmPayment.find(query).sort({ createdAt: -1 }).lean(),
    CrmAmc.find(query).sort({ renewalDate: 1, updatedAt: -1 }).lean(),
    Payment.find(query).sort({ createdAt: -1 }).lean(),
    FinanceVendor.find(query).sort({ name: 1 }).lean(),
    FinanceVendorBill.find(query).sort({ dueDate: 1, createdAt: -1 }).lean(),
    FinancePurchaseOrder.find(query).sort({ createdAt: -1 }).lean(),
    FinanceExpense.find(query).sort({ expenseDate: -1, createdAt: -1 }).lean(),
    FinancePayrollRun.find(query).sort({ createdAt: -1 }).lean(),
    FinanceTaxRecord.find(query).sort({ createdAt: -1 }).lean(),
    FinanceBankEntry.find(query).sort({ entryDate: -1 }).lean(),
    CrmProject.find(query).sort({ updatedAt: -1 }).lean(),
    FinanceSettings.findOne(query).lean(),
  ]);

  return {
    invoices: invoices.map(serializeSalesInvoice),
    crmPayments: crmPayments.map(serializeCrmPayment),
    amcRecords: amcRecords.map(serializeAmc),
    subscriptionPayments: subscriptionPayments.map(serializeSubscriptionPayment),
    vendors,
    vendorBills,
    purchaseOrders,
    expenses,
    payrollRuns,
    taxRecords,
    bankEntries,
    projects,
    settings,
  };
}

function buildIncomeStreams(data, range = {}) {
  const salesIncome = data.invoices
    .filter((invoice) => invoice.paymentStatus === 'Paid')
    .filter((invoice) => withinRange(invoice.invoiceDate, range))
    .map((invoice) => ({
      id: invoice.id,
      stream: 'Paid Sales Invoice',
      source: 'sales-db',
      clientName: invoice.clientName,
      reference: invoice.invoiceNumber,
      amount: invoice.paidAmount,
      taxableAmount: invoice.taxableAmount,
      gstAmount: invoice.gstAmount,
      date: invoice.invoiceDate,
      status: 'Collected',
    }));

  const crmPaymentIncome = data.crmPayments
    .filter((payment) => payment.paidAmount > 0)
    .filter((payment) => withinRange(payment.paidAt || payment.invoiceDate, range))
    .map((payment) => ({
      id: payment.id,
      stream: 'CRM Paid Invoice',
      source: 'crm-db',
      clientName: payment.clientName,
      reference: payment.invoiceNumber,
      amount: payment.paidAmount,
      taxableAmount: payment.totalAmount,
      gstAmount: 0,
      date: payment.paidAt || payment.invoiceDate,
      status: payment.paymentStatus,
    }));

  const amcIncome = data.amcRecords
    .filter((amc) => amc.paymentStatus === 'Paid')
    .filter((amc) => withinRange(amc.paidAt || amc.renewalDate, range))
    .map((amc) => ({
      id: amc.id,
      stream: 'AMC Payment',
      source: 'crm-amc-db',
      clientName: amc.clientName,
      reference: amc.domainName || amc.id,
      amount: amc.paidAmount,
      taxableAmount: amc.paidAmount,
      gstAmount: 0,
      date: amc.paidAt || amc.renewalDate,
      status: 'Collected',
    }));

  return [...salesIncome, ...crmPaymentIncome, ...amcIncome]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function buildExpenseStreams(data, range = {}) {
  const expenses = data.expenses
    .filter((item) => withinRange(item.expenseDate || item.createdAt, range))
    .map((item) => ({
      id: String(item._id || ''),
      stream: item.type || 'Expense',
      source: 'finance-expenses',
      partyName: item.vendorName || item.employeeName || item.category,
      reference: item.category || '',
      amount: toNumber(item.amount) + toNumber(item.taxAmount),
      date: item.expenseDate || item.createdAt,
      status: item.status || 'Submitted',
    }));

  const vendorPayments = data.vendorBills
    .filter((bill) => ['Paid', 'Payment Scheduled', 'Approved'].includes(bill.status))
    .filter((bill) => withinRange(bill.updatedAt || bill.billDate, range))
    .map((bill) => ({
      id: String(bill._id || ''),
      stream: 'Vendor Payment',
      source: 'finance-payables',
      partyName: bill.vendorName,
      reference: bill.billNumber,
      amount: bill.status === 'Paid' ? toNumber(bill.paidAmount || bill.netPayable) : toNumber(bill.netPayable),
      date: bill.updatedAt || bill.billDate,
      status: bill.status,
    }));

  const payroll = data.payrollRuns
    .filter((run) => ['Finance Review', 'CFO Approval', 'Processed'].includes(run.status))
    .filter((run) => withinRange(run.processedAt || run.updatedAt || run.createdAt, range))
    .map((run) => ({
      id: String(run._id || ''),
      stream: 'Payroll',
      source: 'finance-payroll',
      partyName: run.month,
      reference: run.runNumber,
      amount: toNumber(run.netPayable),
      date: run.processedAt || run.updatedAt || run.createdAt,
      status: run.status,
    }));

  return [...expenses, ...vendorPayments, ...payroll]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function buildOutstanding(data) {
  const invoiceOutstanding = data.invoices
    .filter((invoice) => invoice.balanceAmount > 0)
    .map((invoice) => ({
      ...invoice,
      outstandingType: 'Invoice Outstanding',
      reminderStage: invoice.daysOverdue >= 14 ? 'Finance Follow-up' : 'Payment Due',
    }));

  const crmOutstanding = data.crmPayments
    .filter((payment) => payment.balanceAmount > 0)
    .map((payment) => ({
      ...payment,
      outstandingType: 'Project Balance Payment',
      reminderStage: payment.status === 'Overdue' ? 'Escalate' : 'Follow-up',
    }));

  const amcOutstanding = data.amcRecords
    .filter((amc) => amc.balanceAmount > 0 || ['Upcoming Renewals', 'Unpaid', 'Overdue', 'Blocked'].includes(amc.status))
    .map((amc) => ({
      ...amc,
      invoiceNumber: amc.domainName || amc.id,
      invoiceDate: amc.renewalDate,
      dueDate: amc.renewalDate,
      outstandingType: 'AMC Outstanding',
      reminderStage: amc.daysUntilRenewal !== null && amc.daysUntilRenewal <= 15 ? 'Escalation' : 'Renewal Reminder',
      daysOverdue: amc.daysUntilRenewal !== null && amc.daysUntilRenewal < 0 ? Math.abs(amc.daysUntilRenewal) : 0,
      agingBucket: agingBucket(amc.daysUntilRenewal !== null && amc.daysUntilRenewal < 0 ? Math.abs(amc.daysUntilRenewal) : 0),
    }));

  return [...invoiceOutstanding, ...crmOutstanding, ...amcOutstanding]
    .sort((a, b) => toNumber(b.balanceAmount || b.outstandingAmount) - toNumber(a.balanceAmount || a.outstandingAmount));
}

function buildClientBalances(data) {
  const clients = new Map();
  const ensure = (name) => {
    const key = normalize(name) || 'Unassigned Client';
    if (!clients.has(key)) {
      clients.set(key, {
        clientName: key,
        invoicedAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        overdueAmount: 0,
        invoiceCount: 0,
        lastPaymentDate: null,
        nextAmcRenewal: null,
      });
    }
    return clients.get(key);
  };

  [...data.invoices, ...data.crmPayments].forEach((record) => {
    const row = ensure(record.clientName);
    row.invoicedAmount += toNumber(record.totalAmount);
    row.paidAmount += toNumber(record.paidAmount);
    row.outstandingAmount += toNumber(record.balanceAmount);
    row.invoiceCount += 1;
    if (record.status === 'Overdue') row.overdueAmount += toNumber(record.balanceAmount);
    if (record.paidAt && (!row.lastPaymentDate || new Date(record.paidAt) > new Date(row.lastPaymentDate))) {
      row.lastPaymentDate = record.paidAt;
    }
  });

  data.amcRecords.forEach((amc) => {
    const row = ensure(amc.clientName);
    row.invoicedAmount += toNumber(amc.totalAmount);
    row.paidAmount += toNumber(amc.paidAmount);
    row.outstandingAmount += toNumber(amc.balanceAmount);
    if (amc.daysUntilRenewal !== null && amc.daysUntilRenewal < 0) row.overdueAmount += toNumber(amc.balanceAmount);
    if (amc.renewalDate && (!row.nextAmcRenewal || new Date(amc.renewalDate) < new Date(row.nextAmcRenewal))) {
      row.nextAmcRenewal = amc.renewalDate;
    }
  });

  return Array.from(clients.values()).sort((a, b) => b.outstandingAmount - a.outstandingAmount);
}

function buildAging(rows, amountField = 'balanceAmount', dateField = 'dueDate') {
  const buckets = {
    Current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };
  rows.forEach((row) => {
    const amount = toNumber(row[amountField]);
    if (amount <= 0) return;
    const days = row[dateField] ? Math.max(daysBetween(row[dateField]), 0) : 0;
    buckets[agingBucket(days)] += amount;
  });
  return Object.entries(buckets).map(([bucket, amount]) => ({ bucket, amount }));
}

function buildDashboard(data, range = {}) {
  const incomeStreams = buildIncomeStreams(data, range);
  const expenseStreams = buildExpenseStreams(data, range);
  const outstanding = buildOutstanding(data);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthRange = { from: monthStart, to: endOfDay(new Date()) };
  const monthlyExpenses = buildExpenseStreams(data, monthRange);
  const unpaidVendorBills = data.vendorBills.filter((bill) => !['Paid', 'Rejected'].includes(bill.status));
  const openPayrollRuns = data.payrollRuns.filter((run) => run.status !== 'Processed');
  const gstCollected = sum(data.invoices.filter((invoice) => invoice.paymentStatus === 'Paid'), (invoice) => invoice.gstAmount);
  const gstCredits = sum(data.vendorBills, (bill) => bill.taxAmount) + sum(data.expenses, (expense) => expense.taxAmount);
  const totalIncome = sum(incomeStreams, (stream) => stream.amount);
  const totalExpenses = sum(expenseStreams, (stream) => stream.amount);
  const incomeByMonth = groupByMonth(incomeStreams, (stream) => stream.amount, (stream) => stream.date);
  const expenseByMonth = groupByMonth(expenseStreams, (stream) => stream.amount, (stream) => stream.date);

  return {
    metrics: {
      totalRevenue: totalIncome,
      totalCollectedAmount: totalIncome,
      totalOutstandingAmount: sum(outstanding, (item) => item.balanceAmount || item.outstandingAmount),
      overdueInvoices: outstanding.filter((item) => item.daysOverdue > 0 || item.status === 'Overdue').length,
      currentMonthExpenses: sum(monthlyExpenses, (stream) => stream.amount),
      payrollLiability: sum(openPayrollRuns, (run) => run.netPayable),
      vendorPaymentsPending: sum(unpaidVendorBills, (bill) => Math.max(toNumber(bill.netPayable) - toNumber(bill.paidAmount), 0)),
      gstPayable: Math.max(gstCollected - gstCredits, 0),
      netProfitLoss: totalIncome - totalExpenses,
      cashPosition: totalIncome - totalExpenses,
      amcRenewalsDue: data.amcRecords.filter((amc) => upcomingWithin(amc.renewalDate, 60) && amc.paymentStatus !== 'Paid').length,
      subscriptionRenewalsDue: data.vendorBills.filter((bill) => /subscription/i.test(bill.serviceType || '') && upcomingWithin(bill.dueDate, 30)).length,
    },
    cashFlowTrend: incomeByMonth.map((row) => {
      const expense = expenseByMonth.find((item) => item.month === row.month)?.amount || 0;
      return {
        month: row.month,
        inflow: row.amount,
        outflow: expense,
        net: row.amount - expense,
      };
    }),
    incomeStreams: incomeStreams.slice(0, 10),
    expenseStreams: expenseStreams.slice(0, 10),
    receivablesAging: buildAging(outstanding),
    payablesAging: buildAging(unpaidVendorBills, 'netPayable', 'dueDate'),
    clientBalances: buildClientBalances(data).slice(0, 8),
  };
}

async function getDashboard(companyCode, query = {}) {
  const data = await getFinanceCollections(companyCode);
  return {
    success: true,
    companyCode: normalize(companyCode),
    range: dateRangeFromQuery(query),
    ...buildDashboard(data, dateRangeFromQuery(query)),
  };
}

async function getIncomeStreams(companyCode, query = {}) {
  const data = await getFinanceCollections(companyCode);
  const range = dateRangeFromQuery(query);
  const streams = buildIncomeStreams(data, range);
  return {
    success: true,
    streams,
    analytics: {
      totalIncome: sum(streams, (stream) => stream.amount),
      salesInvoiceIncome: sum(streams.filter((stream) => stream.source === 'sales-db'), (stream) => stream.amount),
      crmPaymentIncome: sum(streams.filter((stream) => stream.source === 'crm-db'), (stream) => stream.amount),
      amcIncome: sum(streams.filter((stream) => stream.source === 'crm-amc-db'), (stream) => stream.amount),
    },
  };
}

async function getReceivables(companyCode, view = 'invoices', query = {}) {
  const data = await getFinanceCollections(companyCode);
  const range = dateRangeFromQuery(query);
  const invoices = data.invoices.filter((item) => withinRange(item.invoiceDate, range));
  const payments = [...data.invoices.filter((item) => item.paidAmount > 0), ...data.crmPayments.filter((item) => item.paidAmount > 0)]
    .filter((item) => withinRange(item.paidAt || item.invoiceDate, range));
  const outstanding = buildOutstanding(data);
  const amcRenewals = data.amcRecords;
  const clientBalance = buildClientBalances(data);
  const views = {
    invoices,
    'payments-received': payments,
    outstanding,
    'amc-renewals': amcRenewals,
    'client-balance': clientBalance,
  };

  return {
    success: true,
    view,
    items: views[view] || invoices,
    analytics: {
      totalInvoiced: sum(invoices, (item) => item.totalAmount),
      totalPaid: sum(payments, (item) => item.paidAmount),
      outstandingAmount: sum(outstanding, (item) => item.balanceAmount || item.outstandingAmount),
      amcDue: amcRenewals.filter((item) => item.paymentStatus !== 'Paid').length,
    },
  };
}

async function getPayables(companyCode, view = 'vendor-bills') {
  const data = await getFinanceCollections(companyCode);
  const vendorPayments = data.vendorBills.filter((bill) => ['Payment Scheduled', 'Paid', 'Approved'].includes(bill.status));
  const subscriptionPayments = data.vendorBills.filter((bill) => /subscription|license|hosting|software/i.test(bill.serviceType || bill.vendorName || ''));
  const views = {
    'vendor-bills': data.vendorBills,
    'purchase-orders': data.purchaseOrders,
    'vendor-payments': vendorPayments,
    'subscription-payments': subscriptionPayments,
  };
  return {
    success: true,
    view,
    items: views[view] || data.vendorBills,
    analytics: {
      pendingPayable: sum(data.vendorBills.filter((bill) => bill.status !== 'Paid'), (bill) => Math.max(toNumber(bill.netPayable) - toNumber(bill.paidAmount), 0)),
      paidAmount: sum(data.vendorBills.filter((bill) => bill.status === 'Paid'), (bill) => bill.paidAmount || bill.netPayable),
      purchaseOrderValue: sum(data.purchaseOrders, (po) => po.totalAmount),
      subscriptionsDue: subscriptionPayments.filter((bill) => bill.status !== 'Paid').length,
    },
  };
}

async function getExpenses(companyCode, view = 'company-expenses') {
  const data = await getFinanceCollections(companyCode);
  const typeMap = {
    'employee-claims': 'Employee Claim',
    'company-expenses': 'Company Expense',
    reimbursements: 'Reimbursement',
  };
  const type = typeMap[view];
  const items = type ? data.expenses.filter((expense) => expense.type === type) : data.expenses;
  return {
    success: true,
    view,
    items,
    analytics: {
      submitted: data.expenses.filter((expense) => expense.status === 'Submitted').length,
      verified: data.expenses.filter((expense) => expense.status === 'Finance Verified').length,
      paid: data.expenses.filter((expense) => expense.status === 'Paid').length,
      totalExpense: sum(data.expenses, (expense) => toNumber(expense.amount) + toNumber(expense.taxAmount)),
    },
  };
}

async function getPayroll(companyCode, view = 'payroll-runs') {
  const data = await getFinanceCollections(companyCode);
  const salaryProcessing = data.payrollRuns.filter((run) => run.status !== 'Processed');
  const payslips = data.payrollRuns.flatMap((run) => (run.items || []).map((item) => ({
    ...item,
    runNumber: run.runNumber,
    month: run.month,
    runStatus: run.status,
  })));
  const views = {
    'payroll-runs': data.payrollRuns,
    'salary-processing': salaryProcessing,
    payslips,
  };
  return {
    success: true,
    view,
    items: views[view] || data.payrollRuns,
    analytics: {
      openRuns: salaryProcessing.length,
      processedRuns: data.payrollRuns.filter((run) => run.status === 'Processed').length,
      payrollLiability: sum(salaryProcessing, (run) => run.netPayable),
      processedAmount: sum(data.payrollRuns.filter((run) => run.status === 'Processed'), (run) => run.netPayable),
    },
  };
}

async function getTax(companyCode, view = 'gst') {
  const data = await getFinanceCollections(companyCode);
  const gstCollected = sum(data.invoices.filter((invoice) => invoice.paymentStatus === 'Paid'), (invoice) => invoice.gstAmount);
  const gstPaid = sum(data.vendorBills, (bill) => bill.taxAmount) + sum(data.expenses, (expense) => expense.taxAmount);
  const tdsDeducted = sum(data.vendorBills, (bill) => bill.tdsDeducted) + sum(data.payrollRuns, (run) => run.deductions);
  const gst = {
    gstCollected,
    gstPaid,
    inputTaxCredit: gstPaid,
    gstPayable: Math.max(gstCollected - gstPaid, 0),
    records: data.taxRecords.filter((record) => String(record.type || '').includes('GST')),
  };
  const tds = {
    tdsDeducted,
    tdsPayable: tdsDeducted,
    records: data.taxRecords.filter((record) => String(record.type || '').includes('TDS')),
  };
  const reports = {
    records: data.taxRecords,
    gst,
    tds,
  };
  return {
    success: true,
    view,
    ...(view === 'tds' ? tds : view === 'tax-reports' ? reports : gst),
  };
}

async function getBanking(companyCode, view = 'cash-flow') {
  const data = await getFinanceCollections(companyCode);
  const incomeStreams = buildIncomeStreams(data);
  const expenseStreams = buildExpenseStreams(data);
  const cashFlow = {
    openingBalance: 0,
    moneyReceived: sum(incomeStreams, (stream) => stream.amount),
    moneyPaid: sum(expenseStreams, (stream) => stream.amount),
    closingBalance: sum(incomeStreams, (stream) => stream.amount) - sum(expenseStreams, (stream) => stream.amount),
    trend: buildDashboard(data).cashFlowTrend,
  };
  const views = {
    'cash-flow': cashFlow,
    'bank-reconciliation': data.bankEntries,
    'payment-matching': data.bankEntries.filter((entry) => entry.status !== 'Reconciled'),
  };
  return {
    success: true,
    view,
    items: views[view],
    analytics: {
      unmatched: data.bankEntries.filter((entry) => entry.status === 'Unmatched').length,
      matched: data.bankEntries.filter((entry) => entry.status === 'Matched').length,
      reconciled: data.bankEntries.filter((entry) => entry.status === 'Reconciled').length,
    },
  };
}

async function getReports(companyCode, view = 'profit-loss') {
  const data = await getFinanceCollections(companyCode);
  const dashboard = buildDashboard(data);
  const outstanding = buildOutstanding(data);
  const openVendorBills = data.vendorBills.filter((bill) => bill.status !== 'Paid');
  const reports = {
    'profit-loss': {
      totalIncome: dashboard.metrics.totalRevenue,
      totalExpenses: sum(buildExpenseStreams(data), (stream) => stream.amount),
      netProfitLoss: dashboard.metrics.netProfitLoss,
      incomeStreams: buildIncomeStreams(data),
      expenseStreams: buildExpenseStreams(data),
    },
    'balance-sheet': {
      assets: {
        bankAndCash: dashboard.metrics.cashPosition,
        accountsReceivable: dashboard.metrics.totalOutstandingAmount,
      },
      liabilities: {
        accountsPayable: dashboard.metrics.vendorPaymentsPending,
        gstPayable: dashboard.metrics.gstPayable,
        payrollLiability: dashboard.metrics.payrollLiability,
      },
      equity: dashboard.metrics.netProfitLoss,
    },
    'cash-flow': dashboard.cashFlowTrend,
    'receivables-aging': buildAging(outstanding),
    'payables-aging': buildAging(openVendorBills, 'netPayable', 'dueDate'),
    'project-profitability': data.projects.map((project) => {
      const client = buildClientBalances(data).find((row) => row.clientName.toLowerCase() === String(project.clientCompanyName || '').toLowerCase());
      return {
        projectId: String(project._id || ''),
        clientName: project.clientCompanyName,
        projectManagerName: project.projectManagerName,
        status: project.status,
        revenue: toNumber(client?.paidAmount),
        outstanding: toNumber(client?.outstandingAmount),
        estimatedCost: 0,
        profitability: toNumber(client?.paidAmount),
      };
    }),
  };
  return {
    success: true,
    view,
    report: reports[view] || reports['profit-loss'],
  };
}

function financeNavigation() {
  return [
    { id: 'dashboard', label: 'Dashboard', path: 'dashboard' },
    { id: 'receivables', label: 'Receivables', children: [
      { id: 'invoices', label: 'Invoices' },
      { id: 'payments-received', label: 'Payments Received' },
      { id: 'outstanding', label: 'Outstanding' },
      { id: 'amc-renewals', label: 'AMC Renewals' },
      { id: 'client-balance', label: 'Client Balance' },
    ] },
    { id: 'payables', label: 'Payables', children: [
      { id: 'vendor-bills', label: 'Vendor Bills' },
      { id: 'purchase-orders', label: 'Purchase Orders' },
      { id: 'vendor-payments', label: 'Vendor Payments' },
      { id: 'subscription-payments', label: 'Subscription Payments' },
    ] },
    { id: 'expenses', label: 'Expenses', children: [
      { id: 'employee-claims', label: 'Employee Claims' },
      { id: 'company-expenses', label: 'Company Expenses' },
      { id: 'reimbursements', label: 'Reimbursements' },
    ] },
    { id: 'payroll', label: 'Payroll', children: [
      { id: 'payroll-runs', label: 'Payroll Runs' },
      { id: 'salary-processing', label: 'Salary Processing' },
      { id: 'payslips', label: 'Payslips' },
    ] },
    { id: 'tax', label: 'Tax', children: [
      { id: 'gst', label: 'GST' },
      { id: 'tds', label: 'TDS' },
      { id: 'tax-reports', label: 'Tax Reports' },
    ] },
    { id: 'banking', label: 'Banking', children: [
      { id: 'cash-flow', label: 'Cash Flow' },
      { id: 'bank-reconciliation', label: 'Bank Reconciliation' },
      { id: 'payment-matching', label: 'Payment Matching' },
    ] },
    { id: 'reports', label: 'Reports', children: [
      { id: 'profit-loss', label: 'Profit & Loss' },
      { id: 'balance-sheet', label: 'Balance Sheet' },
      { id: 'cash-flow', label: 'Cash Flow' },
      { id: 'receivables-aging', label: 'Receivables Aging' },
      { id: 'payables-aging', label: 'Payables Aging' },
      { id: 'project-profitability', label: 'Project Profitability' },
    ] },
    { id: 'settings', label: 'Settings', children: [
      { id: 'tax-settings', label: 'Tax Settings' },
      { id: 'invoice-templates', label: 'Invoice Templates' },
      { id: 'payment-terms', label: 'Payment Terms' },
      { id: 'approval-rules', label: 'Approval Rules' },
      { id: 'chart-of-accounts', label: 'Chart of Accounts' },
    ] },
  ];
}

module.exports = {
  FinanceBankEntry,
  FinanceExpense,
  FinancePayrollRun,
  FinancePurchaseOrder,
  FinanceSettings,
  FinanceTaxRecord,
  FinanceVendor,
  FinanceVendorBill,
  buildDashboard,
  buildExpenseStreams,
  buildIncomeStreams,
  buildOutstanding,
  dateRangeFromQuery,
  financeNavigation,
  getBanking,
  getDashboard,
  getExpenses,
  getFinanceCollections,
  getIncomeStreams,
  getPayables,
  getPayroll,
  getReceivables,
  getReports,
  getTax,
  normalize,
  sum,
  toNumber,
};

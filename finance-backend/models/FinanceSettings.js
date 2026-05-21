const mongoose = require('mongoose');

const financeSettingsSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, unique: true },
    taxSettings: {
      gstPercentage: { type: Number, default: 18 },
      tdsPercentage: { type: Number, default: 10 },
      gstin: { type: String, trim: true, default: '' },
    },
    paymentTerms: {
      defaultReceivableTerm: { type: String, trim: true, default: 'Net 15' },
      defaultPayableTerm: { type: String, trim: true, default: 'Net 15' },
      overdueGraceDays: { type: Number, default: 14 },
    },
    approvalRules: {
      purchaseOrderApprovalLimit: { type: Number, default: 50000 },
      vendorPaymentApprovalLimit: { type: Number, default: 25000 },
      expenseApprovalLimit: { type: Number, default: 10000 },
    },
    invoiceTemplate: {
      name: { type: String, trim: true, default: 'Softrate GST Standard' },
      footer: { type: String, trim: true, default: '' },
    },
    chartOfAccounts: {
      income: { type: [String], default: ['Sales Revenue', 'AMC Revenue', 'Subscription Revenue', 'Project Revenue'] },
      expense: { type: [String], default: ['Payroll', 'Vendor Payments', 'Subscriptions', 'Reimbursements', 'Operations'] },
      assets: { type: [String], default: ['Bank', 'Cash', 'Receivables'] },
      liabilities: { type: [String], default: ['Payables', 'GST Payable', 'TDS Payable'] },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.FinanceSettings || mongoose.model('FinanceSettings', financeSettingsSchema);

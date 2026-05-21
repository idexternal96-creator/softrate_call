const mongoose = require('mongoose');

const financeExpenseSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: ['Employee Claim', 'Company Expense', 'Reimbursement'], default: 'Company Expense' },
    category: { type: String, trim: true, default: 'Miscellaneous' },
    employeeName: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    vendorName: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    expenseDate: { type: Date, default: Date.now, index: true },
    amount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    reimbursable: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['Submitted', 'Manager Approved', 'Finance Verified', 'Rejected', 'Paid'],
      default: 'Submitted',
    },
    receiptUrl: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

financeExpenseSchema.index({ companyCode: 1, type: 1, status: 1 });
financeExpenseSchema.index({ companyCode: 1, expenseDate: -1 });

module.exports = mongoose.models.FinanceExpense || mongoose.model('FinanceExpense', financeExpenseSchema);

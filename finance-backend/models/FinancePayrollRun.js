const mongoose = require('mongoose');

const payrollItemSchema = new mongoose.Schema(
  {
    employeeName: { type: String, required: true, trim: true },
    employeePhone: { type: String, trim: true, default: '' },
    basicSalary: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    reimbursements: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    esi: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Reviewed', 'Approved', 'Processed'], default: 'Draft' },
  },
  { _id: false }
);

const financePayrollRunSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, index: true },
    runNumber: { type: String, required: true, trim: true },
    month: { type: String, required: true, trim: true },
    freezeDate: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    items: { type: [payrollItemSchema], default: [] },
    grossAmount: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    reimbursements: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Finance Review', 'CFO Approval', 'Processed'], default: 'Draft' },
  },
  { timestamps: true }
);

financePayrollRunSchema.index({ companyCode: 1, runNumber: 1 }, { unique: true });
financePayrollRunSchema.index({ companyCode: 1, month: 1 });

module.exports = mongoose.models.FinancePayrollRun || mongoose.model('FinancePayrollRun', financePayrollRunSchema);

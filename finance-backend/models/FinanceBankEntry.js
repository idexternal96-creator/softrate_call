const mongoose = require('mongoose');

const financeBankEntrySchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, index: true },
    entryDate: { type: Date, default: Date.now, index: true },
    bankAccount: { type: String, trim: true, default: 'Primary Bank' },
    direction: { type: String, enum: ['Inflow', 'Outflow'], default: 'Inflow' },
    amount: { type: Number, default: 0 },
    reference: { type: String, trim: true, default: '' },
    matchedType: { type: String, enum: ['Invoice', 'AMC', 'Vendor Bill', 'Expense', 'Payroll', 'Other'], default: 'Other' },
    matchedRecordId: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['Unmatched', 'Matched', 'Reconciled'], default: 'Unmatched' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

financeBankEntrySchema.index({ companyCode: 1, entryDate: -1 });
financeBankEntrySchema.index({ companyCode: 1, status: 1 });

module.exports = mongoose.models.FinanceBankEntry || mongoose.model('FinanceBankEntry', financeBankEntrySchema);

const mongoose = require('mongoose');

const financeTaxRecordSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: ['GST Collected', 'GST Paid', 'Input Tax Credit', 'TDS Deducted', 'TDS Payable'], default: 'GST Collected' },
    period: { type: String, required: true, trim: true },
    source: { type: String, trim: true, default: 'Manual' },
    taxableAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Ready', 'Filed', 'Paid'], default: 'Draft' },
    dueDate: { type: Date, default: null },
    filedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

financeTaxRecordSchema.index({ companyCode: 1, type: 1, period: 1 });

module.exports = mongoose.models.FinanceTaxRecord || mongoose.model('FinanceTaxRecord', financeTaxRecordSchema);

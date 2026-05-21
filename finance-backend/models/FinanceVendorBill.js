const mongoose = require('mongoose');

const financeVendorBillSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceVendor', default: null },
    vendorName: { type: String, required: true, trim: true },
    billNumber: { type: String, required: true, trim: true },
    serviceType: { type: String, trim: true, default: 'Operations' },
    billDate: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date, default: null, index: true },
    amount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    tdsDeducted: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Draft', 'Pending Approval', 'Approved', 'Payment Scheduled', 'Paid', 'Overdue', 'Rejected'],
      default: 'Pending Approval',
    },
    paymentReference: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

financeVendorBillSchema.index({ companyCode: 1, billNumber: 1 }, { unique: true });
financeVendorBillSchema.index({ companyCode: 1, status: 1, dueDate: 1 });

module.exports = mongoose.models.FinanceVendorBill || mongoose.model('FinanceVendorBill', financeVendorBillSchema);

const mongoose = require('mongoose');

const crmPaymentSchema = new mongoose.Schema(
  {
    companyCode: { type: String, trim: true, default: '' },
    clientCompanyName: { type: String, required: true, trim: true },
    invoiceNumber: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, default: 0 },
    paidAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['Pending', 'Paid', 'Partially Paid', 'Overdue'], default: 'Pending' },
    paidAt: { type: Date },
    paymentMode: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CrmPayment || mongoose.model('CrmPayment', crmPaymentSchema);

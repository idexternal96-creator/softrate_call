const mongoose = require('mongoose');

const financeVendorSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: 'Service Vendor' },
    gstNumber: { type: String, trim: true, default: '' },
    contactName: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    paymentTerms: { type: String, trim: true, default: 'Net 15' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

financeVendorSchema.index({ companyCode: 1, name: 1 }, { unique: true });

module.exports = mongoose.models.FinanceVendor || mongoose.model('FinanceVendor', financeVendorSchema);

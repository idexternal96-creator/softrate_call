const mongoose = require('mongoose');

const quotationItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, default: null },
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  rate: { type: Number, default: 0 },
  taxable: { type: Number, default: 0 },
  gst: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  companyCode: { type: String, required: true, index: true },
  employeePhone: { type: String, default: '', index: true },
  employeeName: { type: String, default: '' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  leadCompanyName: { type: String, required: true },
  contactName: { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  directorEmailAddress: { type: String, default: '' },
  quotationNumber: { type: String, required: true, unique: true },
  versionNo: { type: Number, default: 1 },
  kindNote: { type: String, default: '' },
  items: { type: [quotationItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  gstPercentage: { type: Number, default: 18 },
  gstAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  quotationDate: { type: Date, default: Date.now, index: true },
  createdByRole: { type: String, enum: ['employee', 'admin'], default: 'employee' },
  createdByName: { type: String, default: '' },
  createdByPhone: { type: String, default: '' },
  companySnapshot: {
    name: { type: String, default: '' },
    logo: { type: String, default: '' },
    registeredAddress: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    footer: { type: String, default: '' },
  },
}, { timestamps: true });

quotationSchema.index({ companyCode: 1, employeePhone: 1, quotationDate: -1 });
quotationSchema.index({ companyCode: 1, quotationDate: -1 });

module.exports = mongoose.model('Quotation', quotationSchema);

const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, default: null },
  name: { type: String, required: true },
  sacHsn: { type: String, default: '' },
  quantity: { type: Number, default: 1 },
  rate: { type: Number, default: 0 },
  taxable: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  companyCode: { type: String, required: true, index: true },
  employeePhone: { type: String, default: '', index: true },
  employeeName: { type: String, default: '' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  leadCompanyName: { type: String, required: true },
  contactName: { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  directorEmailAddress: { type: String, default: '' },
  invoiceNumber: { type: String, required: true, unique: true },
  versionNo: { type: Number, default: 1 },
  items: { type: [invoiceItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  gstPercentage: { type: Number, default: 18 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  invoiceDate: { type: Date, default: Date.now, index: true },
  dueDate: { type: Date, default: null },
  paymentStatus: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
  createdByRole: { type: String, enum: ['employee', 'admin'], default: 'employee' },
  createdByName: { type: String, default: '' },
  createdByPhone: { type: String, default: '' },
  companySnapshot: {
    name: { type: String, default: '' },
    logo: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    registeredAddress: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    footer: { type: String, default: '' },
  },
  clientSnapshot: {
    companyName: { type: String, default: '' },
    contactName: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
}, { timestamps: true });

invoiceSchema.index({ companyCode: 1, employeePhone: 1, invoiceDate: -1 });
invoiceSchema.index({ companyCode: 1, invoiceDate: -1 });
invoiceSchema.index({ companyCode: 1, leadCompanyName: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);

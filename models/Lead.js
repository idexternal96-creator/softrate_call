const mongoose = require('mongoose');
const { normalizePhone, normalizeRemarks, normalizeText } = require('../services/leadNormalization');

const leadSchema = new mongoose.Schema({
  companyCode:     { type: String, required: true },
  assignedEmployeePhone: { type: String, required: true },
  leadCompanyName: { type: String, required: true },
  contactName:     { type: String, default: '' },
  contactNumber:   { type: String, required: true },
  status:          { type: String, default: 'New' }, // e.g. New, Contacted, Converted
  setLabel:        { type: String, default: '' },     // e.g. "Jan 2026" or "1/1/2026-10/1/2026"
  companyDescription: { type: String, default: '' },  // Optional detailed info about company
  mainDivisionDescription: { type: String, default: '' },
  directorEmailAddress: { type: String, default: '' },
  remarks:          { type: [String], default: [] },
  isStarred:       { type: Boolean, default: false },
  isFavourite:     { type: Boolean, default: false },
  sheetOrder:      { type: Number, default: 0 },      // original row index from uploaded sheet
  contactNumberNormalized: { type: String, default: '' },
  leadCompanyNameLower: { type: String, default: '' },
  contactNameLower: { type: String, default: '' },
  directorEmailLower: { type: String, default: '' },
  setLabelLower: { type: String, default: '' },
  isArchived: { type: Boolean, default: false, index: true },
  importBatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadImportBatch', default: null },
}, { timestamps: true });

leadSchema.pre('save', function normalizeLead(next) {
  this.companyCode = String(this.companyCode ?? '').trim();
  this.assignedEmployeePhone = String(this.assignedEmployeePhone ?? '').trim();
  this.leadCompanyName = String(this.leadCompanyName ?? '').trim();
  this.contactName = String(this.contactName ?? '').trim();
  this.contactNumber = String(this.contactNumber ?? '').trim();
  this.status = String(this.status ?? 'New').trim() || 'New';
  this.setLabel = String(this.setLabel ?? '').trim();
  this.companyDescription = String(this.companyDescription ?? '').trim();
  this.mainDivisionDescription = String(this.mainDivisionDescription ?? '').trim();
  this.directorEmailAddress = String(this.directorEmailAddress ?? '').trim();
  this.remarks = normalizeRemarks(this.remarks);
  this.contactNumberNormalized = normalizePhone(this.contactNumber);
  this.leadCompanyNameLower = normalizeText(this.leadCompanyName);
  this.contactNameLower = normalizeText(this.contactName);
  this.directorEmailLower = normalizeText(this.directorEmailAddress);
  this.setLabelLower = normalizeText(this.setLabel);
  next();
});

leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, isArchived: 1, setLabelLower: 1, status: 1, sheetOrder: 1, _id: 1 });
leadSchema.index({ companyCode: 1, isArchived: 1, setLabelLower: 1, status: 1, sheetOrder: 1, _id: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, contactNumberNormalized: 1 });
leadSchema.index({ companyCode: 1, contactNumberNormalized: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, leadCompanyNameLower: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, isArchived: 1, leadCompanyNameLower: 1, sheetOrder: 1, _id: 1 });
leadSchema.index({ companyCode: 1, leadCompanyNameLower: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, isArchived: 1, isFavourite: 1, status: 1, sheetOrder: 1, _id: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, isArchived: 1, updatedAt: -1, status: 1, _id: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, contactNameLower: 1, sheetOrder: 1, _id: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, directorEmailLower: 1, sheetOrder: 1, _id: 1 });
leadSchema.index({ companyCode: 1, assignedEmployeePhone: 1, status: 1, sheetOrder: 1, _id: 1 });
leadSchema.index({
  leadCompanyName: 'text',
  contactName: 'text',
  directorEmailAddress: 'text',
  companyDescription: 'text',
  mainDivisionDescription: 'text',
  remarks: 'text',
});

module.exports = mongoose.model('Lead', leadSchema);

const mongoose = require('mongoose');
const { normalizeText } = require('../services/leadNormalization');

const companyNoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const leadCompanyProfileSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true, index: true, trim: true },
    leadCompanyName: { type: String, required: true, trim: true },
    normalizedCompanyName: { type: String, required: true, index: true },
    alternatePhone: { type: String, default: '', trim: true },
    alternateEmail: { type: String, default: '', trim: true },
    notes: { type: [companyNoteSchema], default: [] },
  },
  { timestamps: true }
);

leadCompanyProfileSchema.pre('validate', function normalizeProfile(next) {
  this.companyCode = String(this.companyCode || '').trim();
  this.leadCompanyName = String(this.leadCompanyName || '').trim();
  this.normalizedCompanyName = normalizeText(this.leadCompanyName);
  this.alternatePhone = String(this.alternatePhone || '').trim();
  this.alternateEmail = String(this.alternateEmail || '').trim();
  this.notes = Array.isArray(this.notes)
    ? this.notes
        .map((note) => ({
          ...note,
          text: String(note?.text || '').trim(),
          createdAt: note?.createdAt ? new Date(note.createdAt) : new Date(),
        }))
        .filter((note) => note.text)
    : [];
  next();
});

leadCompanyProfileSchema.index(
  { companyCode: 1, normalizedCompanyName: 1 },
  { unique: true, name: 'lead_company_profile_company_name_unique' }
);

module.exports = mongoose.model('LeadCompanyProfile', leadCompanyProfileSchema);

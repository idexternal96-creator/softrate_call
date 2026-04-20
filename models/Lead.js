const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  companyCode:     { type: String, required: true },
  assignedEmployeePhone: { type: String, required: true },
  leadCompanyName: { type: String, required: true },
  contactName:     { type: String, default: '' },
  contactNumber:   { type: String, required: true },
  status:          { type: String, default: 'New' }, // e.g. New, Contacted, Converted
  setLabel:        { type: String, default: '' },     // e.g. "Jan 2026" or "1/1/2026-10/1/2026"
  sheetOrder:      { type: Number, default: 0 }       // original row index from uploaded sheet
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);

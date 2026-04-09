const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  companyCode:     { type: String, required: true },
  assignedEmployeePhone: { type: String, required: true },
  leadCompanyName: { type: String, required: true },
  contactName:     { type: String, default: '' },
  contactNumber:   { type: String, required: true },
  status:          { type: String, default: 'New' } // e.g. New, Contacted, Converted
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);

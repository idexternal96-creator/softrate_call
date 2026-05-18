const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  countryCode:  { type: String, default: '+91', trim: true },
  mobile:       { type: String, required: true, trim: true },
  companyCode:  { type: String, required: true, index: true },
  employeeCode: { type: String, default: '' },  // Optional — set by employee in app
  tags:         [{ type: String }],
  // Device info (updated on each sync from Flutter)
  deviceModel:  { type: String, default: '' },
  appVersion:   { type: String, default: '' },
  lastCallTime: { type: Date, default: null },
  lastSyncTime: { type: Date, default: null },
  createdAt:    { type: Date, default: Date.now },
});

module.exports = mongoose.model('Employee', employeeSchema);

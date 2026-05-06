const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  companyCode:   { type: String, required: true, index: true },
  contactNumber: { type: String, required: true, index: true },
  contactName:   { type: String },
  companyName:   { type: String },
  action:        { type: String, required: true }, // 'Lead Created', 'Status Change', 'Remark Added', 'Starred', 'Favourited', 'Bookmarked', etc.
  oldValue:      { type: mongoose.Schema.Types.Mixed },
  newValue:      { type: mongoose.Schema.Types.Mixed },
  details:       { type: String },
  changedBy:     { type: String }, // Phone number of employee
  timestamp:     { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('History', historySchema);

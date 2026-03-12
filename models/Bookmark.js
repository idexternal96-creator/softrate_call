const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  companyCode:   { type: String, required: true, index: true },
  employeePhone: { type: String, required: true, index: true },
  contactNumber: { type: String, required: true },
  contactName:   { type: String, default: '' },
  description:   { type: String, default: '' },
  callTimestamp: { type: Number, default: 0 },  // original call timestamp
  createdAt:     { type: Date, default: Date.now },
});

module.exports = mongoose.model('Bookmark', bookmarkSchema);

const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  companyCode:   { type: String, required: true, index: true },
  employeePhone: { type: String, required: true, index: true },
  contactNumber: { type: String, required: true },
  contactName:   { type: String, default: '' },
  remarks:       [{ type: String }], // multiple descriptions
  brochuresSent: { type: Boolean, default: false },
  techMeet:      { type: Boolean, default: false },
  meetingRemarks:{ type: Boolean, default: false },
  quotationSent: { type: Boolean, default: false },
  proposalSent:  { type: Boolean, default: false },
  whatsappGrp:   { type: Boolean, default: false },
  callTimestamp: { type: Number, default: 0 },  // original call timestamp
  reminderDate:  { type: Date, default: null }, // for follow-ups
  createdAt:     { type: Date, default: Date.now },
});

module.exports = mongoose.model('Bookmark', bookmarkSchema);

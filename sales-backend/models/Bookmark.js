const mongoose = require('mongoose');

const bookmarkSchema = new mongoose.Schema({
  companyCode:   { type: String, required: true, index: true },
  employeePhone: { type: String, required: true, index: true },
  contactNumber: { type: String, required: true },
  contactName:   { type: String, default: '' },
  companyName:   { type: String, default: '' },
  description:   { type: String, default: '' }, // Client requirement
  remarks:       [{ type: String }], // multiple descriptions history
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

bookmarkSchema.index({ companyCode: 1, employeePhone: 1, createdAt: -1 });
bookmarkSchema.index({ companyCode: 1, employeePhone: 1, reminderDate: 1, createdAt: -1 });
bookmarkSchema.index({ companyCode: 1, employeePhone: 1, companyName: 1, createdAt: -1 });
bookmarkSchema.index({ companyCode: 1, reminderDate: 1 });

module.exports = mongoose.model('Bookmark', bookmarkSchema);

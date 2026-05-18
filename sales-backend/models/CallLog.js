const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  companyCode: { type: String, required: true, index: true },
  phone:       { type: String, required: true },          // employee phone = userId
  date:        { type: String, required: true },          // "YYYY-MM-DD"
  incoming:    { type: Number, default: 0 },
  outgoing:    { type: Number, default: 0 },
  missed:      { type: Number, default: 0 },
  rejected:    { type: Number, default: 0 },
  incomingDuration:  { type: Number, default: 0 },        // seconds
  outgoingDuration:  { type: Number, default: 0 },
  totalDuration:     { type: Number, default: 0 },
  connected:         { type: Number, default: 0 },
  incomingConnected: { type: Number, default: 0 },
  outgoingConnected: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

// Unique per employee per day per company
callLogSchema.index({ companyCode: 1, phone: 1, date: 1 }, { unique: true });
callLogSchema.index({ companyCode: 1, date: 1 });
callLogSchema.index({ companyCode: 1, date: 1, phone: 1 });

module.exports = mongoose.model('CallLog', callLogSchema);

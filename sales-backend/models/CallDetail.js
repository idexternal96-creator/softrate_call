const mongoose = require('mongoose');

const callDetailSchema = new mongoose.Schema({
  companyCode: { type: String, required: true, index: true },
  phone:       { type: String, required: true },   // employee phone
  number:      { type: String, default: '' },       // caller/callee number
  callType:    { type: String, enum: ['incoming','outgoing','missed','rejected','unknown'], default: 'unknown' },
  duration:    { type: Number, default: 0 },        // seconds
  timestamp:   { type: Date, required: true },      // actual call time
  date:        { type: String, required: true },    // "YYYY-MM-DD" for fast querying
  name:        { type: String, default: '' },       // contact name (if known)
});

callDetailSchema.index({ companyCode: 1, phone: 1, date: 1 });
callDetailSchema.index({ companyCode: 1, phone: 1, date: 1, timestamp: -1 });
callDetailSchema.index({ companyCode: 1, phone: 1, timestamp: -1 });
callDetailSchema.index({ companyCode: 1, date: 1, callType: 1 });
callDetailSchema.index({ companyCode: 1, date: 1, phone: 1, callType: 1 });
callDetailSchema.index({ companyCode: 1, number: 1 });
// Unique index to prevent duplicate sync entries
callDetailSchema.index({ companyCode: 1, phone: 1, timestamp: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('CallDetail', callDetailSchema);

const mongoose = require('mongoose');

const breakLogSchema = new mongoose.Schema({
  companyCode: { type: String, required: true, index: true },
  employeePhone: { type: String, required: true },
  employeeName: { type: String, default: '' },
  date: { type: String, required: true }, // "YYYY-MM-DD"
  // Each entry is one break tap
  breaks: [{
    startedAt: { type: Date, default: Date.now },
    durationSeconds: { type: Number, default: 0 },
  }],
  totalSeconds: { type: Number, default: 0 }, // cumulative for the day
}, { timestamps: true });

// Unique per employee per day
breakLogSchema.index({ companyCode: 1, employeePhone: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('BreakLog', breakLogSchema);

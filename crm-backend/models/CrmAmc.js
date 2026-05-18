const mongoose = require('mongoose');

const crmAmcSchema = new mongoose.Schema(
  {
    companyCode: { type: String, trim: true, default: '' },
    clientCompanyName: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Active', 'Due Soon', 'Overdue', 'Not Configured'], default: 'Not Configured' },
    renewalDate: { type: Date },
    outstandingAmount: { type: Number, default: 0 },
    owner: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CrmAmc || mongoose.model('CrmAmc', crmAmcSchema);

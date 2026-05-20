const mongoose = require('mongoose');

const crmAmcSchema = new mongoose.Schema(
  {
    companyCode: { type: String, trim: true, default: '' },
    clientCompanyName: { type: String, required: true, trim: true },
    domainName: { type: String, trim: true, lowercase: true, default: '' },
    hostingerDomainId: { type: String, trim: true, default: '' },
    hostingerStatus: { type: String, trim: true, default: '' },
    hostingerExpiresAt: { type: Date },
    domainPurchaseDate: { type: Date },
    renewalDate: { type: Date },
    annualFee: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['Paid', 'Unpaid'], default: 'Unpaid' },
    status: {
      type: String,
      enum: ['Paid', 'Upcoming Renewals', 'Unpaid', 'Blocked', 'Active', 'Due Soon', 'Overdue', 'Not Configured'],
      default: 'Not Configured',
    },
    outstandingAmount: { type: Number, default: 0 },
    owner: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    source: { type: String, enum: ['manual', 'hostinger'], default: 'manual' },
    mappedAt: { type: Date },
    mappedBy: { type: String, trim: true, default: '' },
    lastImportedAt: { type: Date },
    lastPaidAt: { type: Date },
    lastPaidRenewalDate: { type: Date },
    blocked: { type: Boolean, default: false },
    blockedAt: { type: Date },
    blockedBy: { type: String, trim: true, default: '' },
    blockReason: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

crmAmcSchema.index({ companyCode: 1, clientCompanyName: 1 });
crmAmcSchema.index({ companyCode: 1, domainName: 1 });
crmAmcSchema.index({ companyCode: 1, renewalDate: 1 });
crmAmcSchema.index({ companyCode: 1, paymentStatus: 1, blocked: 1 });

module.exports = mongoose.models.CrmAmc || mongoose.model('CrmAmc', crmAmcSchema);

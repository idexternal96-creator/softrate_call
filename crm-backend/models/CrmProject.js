const mongoose = require('mongoose');

const crmProjectSchema = new mongoose.Schema(
  {
    companyCode: { type: String, trim: true, default: '' },
    clientCompanyName: { type: String, required: true, trim: true },
    clientStatus: { type: String, trim: true, default: 'Converted' },
    projectManagerName: { type: String, trim: true, default: '' },
    projectManagerPhone: { type: String, trim: true, default: '' },
    projectManagerEmail: { type: String, trim: true, default: '' },
    projectManagerRole: { type: String, trim: true, default: 'project_manager' },
    status: {
      type: String,
      enum: ['Assigned', 'In Progress', 'On Hold', 'Completed'],
      default: 'Assigned',
    },
    notes: { type: String, trim: true, default: '' },
    mappedBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

crmProjectSchema.index({ companyCode: 1, clientCompanyName: 1 }, { unique: true });
crmProjectSchema.index({ companyCode: 1, projectManagerPhone: 1 });
crmProjectSchema.index({ companyCode: 1, status: 1 });

module.exports = mongoose.models.CrmProject || mongoose.model('CrmProject', crmProjectSchema);

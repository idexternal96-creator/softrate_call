const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true },
    assignedEmployeePhone: { type: String, default: '' },
    leadCompanyName: { type: String, required: true },
    contactName: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    status: { type: String, default: 'New' },
    setLabel: { type: String, default: '' },
    companyDescription: { type: String, default: '' },
    mainDivisionDescription: { type: String, default: '' },
    directorEmailAddress: { type: String, default: '' },
    remarks: { type: [String], default: [] },
    isArchived: { type: Boolean, default: false },
  },
  {
    collection: 'leads',
    timestamps: true,
  }
);

module.exports = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

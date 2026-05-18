const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    companyCode: { type: String, required: true },
    assignedEmployeePhone: { type: String, required: true },
    leadCompanyName: { type: String, required: true },
    contactName: { type: String, default: '' },
    contactNumber: { type: String, required: true },
    status: { type: String, default: 'New' },
    setLabel: { type: String, default: '' },
    companyDescription: { type: String, default: '' },
    mainDivisionDescription: { type: String, default: '' },
    directorEmailAddress: { type: String, default: '' },
    remarks: { type: [String], default: [] },
    isStarred: { type: Boolean, default: false },
    isFavourite: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
  },
  {
    collection: 'leads',
    timestamps: true,
  }
);

module.exports = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

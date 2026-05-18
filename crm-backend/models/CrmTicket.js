const mongoose = require('mongoose');

const crmTicketSchema = new mongoose.Schema(
  {
    companyCode: { type: String, trim: true, default: '' },
    clientCompanyName: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    query: { type: String, trim: true, default: '' },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
    status: { type: String, enum: ['Open', 'In Progress', 'Waiting on Client', 'Resolved'], default: 'Open' },
    raisedBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CrmTicket || mongoose.model('CrmTicket', crmTicketSchema);

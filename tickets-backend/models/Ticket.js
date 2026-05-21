const mongoose = require('mongoose');

const TICKET_CATEGORIES = ['Bug', 'Feature Request', 'Billing', 'Support', 'Change Request'];
const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const TICKET_STATUSES = ['Open', 'In Progress', 'Waiting on Client', 'Resolved', 'Closed'];

const attachmentSchema = new mongoose.Schema(
  {
    fileName: { type: String, trim: true, required: true },
    originalName: { type: String, trim: true, required: true },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    path: { type: String, trim: true, required: true },
    uploadedBy: { type: String, trim: true, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const remarkSchema = new mongoose.Schema(
  {
    authorRole: { type: String, enum: ['client', 'crm'], required: true },
    authorName: { type: String, trim: true, default: '' },
    authorEmail: { type: String, trim: true, lowercase: true, default: '' },
    message: { type: String, trim: true, required: true },
    attachments: { type: [attachmentSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    companyCode: { type: String, trim: true, default: '' },
    clientCompanyName: { type: String, required: true, trim: true },
    clientEmail: { type: String, required: true, trim: true, lowercase: true },
    clientContactName: { type: String, trim: true, default: '' },
    clientPhone: { type: String, trim: true, default: '' },
    subject: { type: String, required: true, trim: true },
    category: { type: String, enum: TICKET_CATEGORIES, required: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'Medium' },
    description: { type: String, required: true, trim: true },
    relatedProjectService: { type: String, trim: true, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    status: { type: String, enum: TICKET_STATUSES, default: 'Open' },
    remarks: { type: [remarkSchema], default: [] },
    source: { type: String, enum: ['client_portal', 'crm_portal'], default: 'client_portal' },
    createdBy: { type: String, trim: true, default: '' },
    lastRespondedBy: { type: String, enum: ['client', 'crm', ''], default: '' },
  },
  { timestamps: true }
);

ticketSchema.index({ companyCode: 1, clientCompanyName: 1, updatedAt: -1 });
ticketSchema.index({ companyCode: 1, clientEmail: 1, updatedAt: -1 });
ticketSchema.index({ companyCode: 1, status: 1, priority: 1 });
ticketSchema.index({ subject: 'text', description: 'text', clientCompanyName: 'text', clientEmail: 'text' });

module.exports = {
  Ticket: mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema),
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
};

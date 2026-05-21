const { Ticket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } = require('../models/Ticket');

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message = 'Ticket not found.') {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeEnum(value, allowed, fallback = '') {
  const normalized = normalizeString(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function attachmentForResponse(attachment) {
  return {
    id: String(attachment._id || ''),
    fileName: attachment.fileName,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedBy: attachment.uploadedBy,
    uploadedAt: attachment.uploadedAt,
  };
}

function remarkForResponse(remark) {
  return {
    id: String(remark._id || ''),
    authorRole: remark.authorRole,
    authorName: remark.authorName,
    authorEmail: remark.authorEmail,
    message: remark.message,
    attachments: (remark.attachments || []).map(attachmentForResponse),
    createdAt: remark.createdAt,
  };
}

function serializeTicket(ticket) {
  if (!ticket) return null;
  return {
    id: String(ticket._id || ticket.id || ''),
    _id: String(ticket._id || ticket.id || ''),
    companyCode: ticket.companyCode,
    clientCompanyName: ticket.clientCompanyName,
    clientEmail: ticket.clientEmail,
    clientContactName: ticket.clientContactName,
    clientPhone: ticket.clientPhone,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    description: ticket.description,
    relatedProjectService: ticket.relatedProjectService,
    attachments: (ticket.attachments || []).map(attachmentForResponse),
    status: ticket.status,
    remarks: (ticket.remarks || []).map(remarkForResponse),
    source: ticket.source,
    createdBy: ticket.createdBy,
    lastRespondedBy: ticket.lastRespondedBy,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function validateTicketPayload(body) {
  const subject = normalizeString(body.subject);
  const category = normalizeEnum(body.category, TICKET_CATEGORIES);
  const priority = normalizeEnum(body.priority, TICKET_PRIORITIES, 'Medium');
  const description = normalizeString(body.description || body.query);

  if (!subject) throw badRequest('Subject is required.');
  if (!category) throw badRequest('Category is required.');
  if (!description) throw badRequest('Description is required.');

  return {
    subject,
    category,
    priority,
    description,
    relatedProjectService: normalizeString(body.relatedProjectService),
  };
}

async function createClientTicket(client, body, attachments = []) {
  const payload = validateTicketPayload(body);
  const ticket = await Ticket.create({
    companyCode: client.companyCode,
    clientCompanyName: client.clientCompanyName,
    clientEmail: client.clientEmail,
    clientContactName: client.clientContactName,
    clientPhone: client.clientPhone,
    ...payload,
    attachments,
    source: 'client_portal',
    createdBy: client.clientEmail,
    lastRespondedBy: 'client',
  });
  return serializeTicket(ticket);
}

function clientQuery(client) {
  return {
    companyCode: client.companyCode,
    clientCompanyName: client.clientCompanyName,
    clientEmail: client.clientEmail,
  };
}

async function listClientTickets(client, filters = {}) {
  const query = clientQuery(client);
  if (filters.status) query.status = filters.status;
  const search = normalizeString(filters.search);
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { subject: regex },
      { description: regex },
      { category: regex },
      { relatedProjectService: regex },
    ];
  }
  const tickets = await Ticket.find(query).sort({ updatedAt: -1 }).lean();
  return tickets.map(serializeTicket);
}

async function getClientTicket(client, id) {
  const ticket = await Ticket.findOne({ _id: id, ...clientQuery(client) }).lean();
  if (!ticket) throw notFound();
  return serializeTicket(ticket);
}

async function getClientTicketDocument(client, id) {
  const ticket = await Ticket.findOne({ _id: id, ...clientQuery(client) });
  if (!ticket) throw notFound();
  return ticket;
}

async function addClientRemark(client, id, message, attachments = []) {
  const ticket = await getClientTicketDocument(client, id);
  const text = normalizeString(message);
  if (!text) throw badRequest('Remark message is required.');
  ticket.remarks.push({
    authorRole: 'client',
    authorName: client.clientContactName || client.clientCompanyName,
    authorEmail: client.clientEmail,
    message: text,
    attachments,
  });
  ticket.lastRespondedBy = 'client';
  if (ticket.status === 'Waiting on Client') ticket.status = 'Open';
  await ticket.save();
  return serializeTicket(ticket);
}

function crmScopedQuery(user, filters = {}) {
  const query = {};
  const companyCode = normalizeString(filters.companyCode || user.companyCode);
  if (companyCode) query.companyCode = companyCode;
  if (filters.status && filters.status !== 'all') query.status = filters.status;
  if (filters.priority && filters.priority !== 'all') query.priority = filters.priority;
  if (filters.category && filters.category !== 'all') query.category = filters.category;
  if (filters.clientCompanyName) query.clientCompanyName = filters.clientCompanyName;
  const search = normalizeString(filters.search);
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { subject: regex },
      { description: regex },
      { clientCompanyName: regex },
      { clientEmail: regex },
      { relatedProjectService: regex },
    ];
  }
  return query;
}

async function listCrmTickets(user, filters = {}) {
  const query = crmScopedQuery(user, filters);
  const tickets = await Ticket.find(query).sort({ updatedAt: -1 }).lean();
  return tickets.map(serializeTicket);
}

async function getCrmTicket(user, id) {
  const query = crmScopedQuery(user);
  const ticket = await Ticket.findOne({ _id: id, ...query }).lean();
  if (!ticket) throw notFound();
  return serializeTicket(ticket);
}

async function getCrmTicketDocument(user, id) {
  const query = crmScopedQuery(user);
  const ticket = await Ticket.findOne({ _id: id, ...query });
  if (!ticket) throw notFound();
  return ticket;
}

async function updateCrmTicketStatus(user, id, status) {
  const nextStatus = normalizeEnum(status, TICKET_STATUSES);
  if (!nextStatus) throw badRequest('Valid ticket status is required.');
  const ticket = await getCrmTicketDocument(user, id);
  ticket.status = nextStatus;
  await ticket.save();
  return serializeTicket(ticket);
}

async function addCrmRemark(user, id, message, attachments = []) {
  const ticket = await getCrmTicketDocument(user, id);
  const text = normalizeString(message);
  if (!text) throw badRequest('Remark message is required.');
  ticket.remarks.push({
    authorRole: 'crm',
    authorName: user.name || user.email || 'CRM',
    authorEmail: user.email || '',
    message: text,
    attachments,
  });
  ticket.lastRespondedBy = 'crm';
  if (ticket.status === 'Open') ticket.status = 'Waiting on Client';
  await ticket.save();
  return serializeTicket(ticket);
}

module.exports = {
  createClientTicket,
  listClientTickets,
  getClientTicket,
  getClientTicketDocument,
  addClientRemark,
  listCrmTickets,
  getCrmTicket,
  getCrmTicketDocument,
  updateCrmTicketStatus,
  addCrmRemark,
  serializeTicket,
};

const Lead = require('../models/Lead');
const User = require('../models/User');

function compact(values) {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function convertedStatusesFor(companyCode) {
  if (!companyCode) return ['Converted'];
  const user = await User.findOne({ companyCode }).lean();
  return compact(user?.convertedPageStatuses || ['Converted']);
}

function convertedStatusQuery(statuses) {
  return {
    $or: [
      { status: { $in: statuses } },
      { status: { $regex: /convert/i } },
    ],
  };
}

function serializeClientFromLeads(leads, matchedEmail) {
  const first = leads[0];
  const contacts = leads.map((lead) => ({
    leadId: String(lead._id || ''),
    contactName: lead.contactName || '',
    contactNumber: lead.contactNumber || '',
    email: normalizeEmail(lead.directorEmailAddress),
    status: lead.status || 'Converted',
  }));

  const matchedContact = contacts.find((contact) => contact.email === matchedEmail) || contacts[0] || {};

  return {
    companyCode: first.companyCode || '',
    clientCompanyName: first.leadCompanyName || '',
    clientEmail: matchedEmail,
    clientContactName: matchedContact.contactName || first.contactName || '',
    clientPhone: matchedContact.contactNumber || first.contactNumber || '',
    status: first.status || 'Converted',
    contactCount: contacts.length,
    contacts,
    managers: Array.from(new Set(compact(leads.map((lead) => lead.assignedEmployeePhone)))),
  };
}

async function findConvertedClientByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const emailRegex = new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i');
  const candidates = await Lead.find({
    isArchived: { $ne: true },
    directorEmailAddress: emailRegex,
  }).sort({ updatedAt: -1, createdAt: -1 }).lean();

  for (const candidate of candidates) {
    const statuses = await convertedStatusesFor(candidate.companyCode);
    const matchingLead = await Lead.findOne({
      _id: candidate._id,
      isArchived: { $ne: true },
      directorEmailAddress: emailRegex,
      ...convertedStatusQuery(statuses),
    }).lean();

    if (!matchingLead) continue;

    const companyLeads = await Lead.find({
      companyCode: matchingLead.companyCode,
      leadCompanyName: matchingLead.leadCompanyName,
      isArchived: { $ne: true },
      ...convertedStatusQuery(statuses),
    }).sort({ updatedAt: -1, createdAt: -1 }).lean();

    return serializeClientFromLeads(companyLeads.length ? companyLeads : [matchingLead], normalizedEmail);
  }

  return null;
}

module.exports = {
  findConvertedClientByEmail,
  normalizeEmail,
};

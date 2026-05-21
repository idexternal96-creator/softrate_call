const Lead = require('../models/Lead');
const User = require('../models/User');
const CrmContract = require('../models/CrmContract');
const CrmAmc = require('../models/CrmAmc');
const { lifecycleStatusFor } = require('./amcService');

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compact(values) {
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

async function convertedStatusesFor(companyCode) {
  if (!companyCode) return ['Converted'];
  const user = await User.findOne({ companyCode }).lean();
  return compact(user?.convertedPageStatuses || ['Converted']);
}

function buildDateLabel(value) {
  if (!value) return '';
  return new Date(value).toISOString();
}

function normalizeLead(lead) {
  return {
    _id: String(lead._id || ''),
    companyCode: lead.companyCode || '',
    assignedEmployeePhone: lead.assignedEmployeePhone || '',
    leadCompanyName: lead.leadCompanyName || '',
    contactName: lead.contactName || '',
    contactNumber: lead.contactNumber || '',
    status: lead.status || 'Converted',
    setLabel: lead.setLabel || '',
    companyDescription: lead.companyDescription || '',
    mainDivisionDescription: lead.mainDivisionDescription || '',
    directorEmailAddress: lead.directorEmailAddress || '',
    remarks: Array.isArray(lead.remarks) ? lead.remarks : [],
    isStarred: !!lead.isStarred,
    isFavourite: !!lead.isFavourite,
    createdAt: buildDateLabel(lead.createdAt),
    updatedAt: buildDateLabel(lead.updatedAt),
  };
}

function contractStatusFor(contracts, type, clientName) {
  const record = contracts.find((item) => (
    item.type === type &&
    item.clientCompanyName.toLowerCase() === clientName.toLowerCase()
  ));
  return record?.status || 'Not Generated';
}

function amcStatusFor(amcRecords, clientName) {
  const record = amcRecords.find((item) => item.clientCompanyName.toLowerCase() === clientName.toLowerCase());
  return lifecycleStatusFor(record);
}

async function getConvertedClients({ companyCode = '', search = '' } = {}) {
  const statuses = await convertedStatusesFor(companyCode);
  const andQuery = [
    { isArchived: { $ne: true } },
    {
      $or: [
        { status: { $in: statuses } },
        { status: { $regex: /convert/i } },
      ],
    },
  ];

  if (companyCode) andQuery.push({ companyCode });

  const searchValue = String(search || '').trim();
  if (searchValue) {
    const regex = new RegExp(escapeRegex(searchValue), 'i');
    andQuery.push({
      $or: [
        { leadCompanyName: regex },
        { contactName: regex },
        { contactNumber: regex },
        { directorEmailAddress: regex },
        { assignedEmployeePhone: regex },
      ],
    });
  }

  const leads = await Lead.find({ $and: andQuery }).sort({ updatedAt: -1, createdAt: -1 }).lean();
  const contracts = await CrmContract.find(companyCode ? { companyCode } : {}).sort({ createdAt: -1 }).lean();
  const amcRecords = await CrmAmc.find(companyCode ? { companyCode } : {}).lean();
  const grouped = new Map();

  leads.forEach((lead) => {
    const key = `${lead.companyCode || ''}|${String(lead.leadCompanyName || 'Unnamed Client').trim()}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(normalizeLead(lead));
  });

  return Array.from(grouped.values()).map((contacts) => {
    const first = contacts[0];
    const managers = Array.from(new Set(compact(contacts.map((lead) => lead.assignedEmployeePhone))));
    const remarks = contacts.flatMap((lead) => lead.remarks || []).filter(Boolean);
    const latest = contacts
      .map((lead) => lead.updatedAt || lead.createdAt)
      .filter(Boolean)
      .sort()
      .reverse()[0] || '';

    return {
      id: `${first.companyCode || 'all'}:${first.leadCompanyName}`,
      companyCode: first.companyCode,
      leadCompanyName: first.leadCompanyName,
      companyName: first.leadCompanyName,
      primaryContact: first.contactName || 'Primary Contact',
      primaryPhone: first.contactNumber,
      primaryEmail: first.directorEmailAddress,
      description: first.mainDivisionDescription || first.companyDescription || '',
      status: first.status || 'Converted',
      contacts,
      contactCount: contacts.length,
      managers,
      remarks,
      latestUpdate: latest,
      slaStatus: contractStatusFor(contracts, 'SLA', first.leadCompanyName),
      ndaStatus: contractStatusFor(contracts, 'NDA', first.leadCompanyName),
      amcStatus: amcStatusFor(amcRecords, first.leadCompanyName),
    };
  });
}

module.exports = {
  getConvertedClients,
};

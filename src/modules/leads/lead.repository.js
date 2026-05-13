const Lead = require('../../../models/Lead');

async function findLeads({ mongoQuery, projection, sort, skip, limit }) {
  return Lead.find(mongoQuery, projection).sort(sort).skip(skip).limit(limit).lean();
}

async function countLeads(mongoQuery) {
  return Lead.countDocuments(mongoQuery);
}

async function createLead(payload) {
  return Lead.create(payload);
}

module.exports = {
  findLeads,
  countLeads,
  createLead,
};

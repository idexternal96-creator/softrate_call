const Quotation = require('../../../models/Quotation');

function countQuotations(filter) {
  return Quotation.countDocuments(filter);
}

function findQuotations({ filter, sort, skip, limit }) {
  return Quotation.find(filter).sort(sort).skip(skip).limit(limit).lean();
}

function createQuotation(payload) {
  return Quotation.create(payload);
}

module.exports = {
  countQuotations,
  findQuotations,
  createQuotation,
};

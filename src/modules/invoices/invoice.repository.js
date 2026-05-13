const Invoice = require('../../../models/Invoice');

function countInvoices(filter) {
  return Invoice.countDocuments(filter);
}

function findInvoices({ filter, sort, skip, limit }) {
  return Invoice.find(filter).sort(sort).skip(skip).limit(limit).lean();
}

function createInvoice(payload) {
  return Invoice.create(payload);
}

module.exports = {
  countInvoices,
  findInvoices,
  createInvoice,
};

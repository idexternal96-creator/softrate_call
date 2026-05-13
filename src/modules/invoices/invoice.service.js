const { parsePageQuery, buildPageResponse } = require('../../common/pagination/pagination');
const { mapInvoiceDocument } = require('./invoice.mapper');
const repository = require('./invoice.repository');

async function listInvoices(filter, query = {}) {
  const pagination = parsePageQuery(query);
  const [total, documents] = await Promise.all([
    repository.countInvoices(filter),
    repository.findInvoices({
      filter,
      sort: { invoiceDate: -1, createdAt: -1 },
      skip: pagination.isPaginated ? pagination.skip : 0,
      limit: pagination.isPaginated ? pagination.pageSize : 300,
    }),
  ]);

  return buildPageResponse({
    items: documents.map(mapInvoiceDocument),
    total,
    page: pagination.page,
    pageSize: pagination.isPaginated ? pagination.pageSize : documents.length,
  });
}

module.exports = {
  listInvoices,
};

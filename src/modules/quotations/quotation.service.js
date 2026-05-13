const { parsePageQuery, buildPageResponse } = require('../../common/pagination/pagination');
const { mapQuotationDocument } = require('./quotation.mapper');
const repository = require('./quotation.repository');

async function listQuotations(filter, query = {}) {
  const pagination = parsePageQuery(query);
  const [total, documents] = await Promise.all([
    repository.countQuotations(filter),
    repository.findQuotations({
      filter,
      sort: { quotationDate: -1, createdAt: -1 },
      skip: pagination.isPaginated ? pagination.skip : 0,
      limit: pagination.isPaginated ? pagination.pageSize : 300,
    }),
  ]);

  return buildPageResponse({
    items: documents.map(mapQuotationDocument),
    total,
    page: pagination.page,
    pageSize: pagination.isPaginated ? pagination.pageSize : documents.length,
  });
}

module.exports = {
  listQuotations,
};

const { buildPageResponse, parsePageQuery } = require('../../common/pagination/pagination');
const { mapLeadDocument } = require('./lead.mapper');
const repository = require('./lead.repository');
const { buildLeadSearchQuery } = require('../../../services/leadQueryService');

async function listLeads(queryDto) {
  const pagination = parsePageQuery(queryDto);
  const { mongoQuery, projection, sort } = buildLeadSearchQuery({
    companyCode: queryDto.companyCode,
    phone: queryDto.phone,
    query: queryDto,
  });

  const [total, documents] = await Promise.all([
    repository.countLeads(mongoQuery),
    repository.findLeads({
      mongoQuery,
      projection,
      sort,
      skip: pagination.skip,
      limit: pagination.limit,
    }),
  ]);

  return {
    success: true,
    ...buildPageResponse({
      items: documents.map(mapLeadDocument),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    }),
  };
}

module.exports = {
  listLeads,
};

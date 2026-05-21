const { buildPageResponse, parsePageQuery } = require('../../common/pagination/pagination');
const { mapReportRow } = require('./report.mapper');

function pageReportRows(rows, query = {}) {
  const pagination = parsePageQuery(query);
  const mappedRows = rows.map(mapReportRow);
  const start = pagination.isPaginated ? pagination.skip : 0;
  const end = pagination.isPaginated ? start + pagination.pageSize : mappedRows.length;

  return buildPageResponse({
    items: mappedRows.slice(start, end),
    total: mappedRows.length,
    page: pagination.page,
    pageSize: pagination.isPaginated ? pagination.pageSize : mappedRows.length,
  });
}

module.exports = {
  pageReportRows,
};

function toReportQueryDto(query = {}) {
  return {
    companyCode: String(query.companyCode || '').trim(),
    period: String(query.period || 'today').trim(),
    page: query.page,
    pageSize: query.pageSize || query.limit,
  };
}

module.exports = { toReportQueryDto };

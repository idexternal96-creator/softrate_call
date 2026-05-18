function toQuotationHistoryQueryDto(query = {}) {
  return {
    companyCode: String(query.companyCode || '').trim(),
    leadId: query.leadId ? String(query.leadId).trim() : undefined,
    search: query.search ? String(query.search).trim() : undefined,
    page: query.page,
    pageSize: query.pageSize || query.limit,
  };
}

module.exports = { toQuotationHistoryQueryDto };

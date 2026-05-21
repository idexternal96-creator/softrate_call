function toInvoiceHistoryQueryDto(query = {}) {
  return {
    companyCode: String(query.companyCode || '').trim(),
    search: query.search ? String(query.search).trim() : undefined,
    page: query.page,
    pageSize: query.pageSize || query.limit,
  };
}

module.exports = { toInvoiceHistoryQueryDto };

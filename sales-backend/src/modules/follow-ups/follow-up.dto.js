function toFollowUpListQueryDto(query = {}) {
  return {
    companyCode: String(query.companyCode || '').trim(),
    employeePhone: query.employeePhone ? String(query.employeePhone).trim() : undefined,
    search: query.search ? String(query.search).trim() : undefined,
    page: query.page,
    pageSize: query.pageSize || query.limit,
    paginated: query.paginated,
  };
}

module.exports = { toFollowUpListQueryDto };

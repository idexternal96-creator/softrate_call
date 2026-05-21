function toLeadListQueryDto(query = {}) {
  return {
    companyCode: String(query.companyCode || '').trim(),
    phone: query.phone ? String(query.phone).trim() : undefined,
    setLabel: query.setLabel ? String(query.setLabel).trim() : undefined,
    division: query.division ? String(query.division).trim() : undefined,
    search: query.search ? String(query.search).trim() : undefined,
    searchMode: ['phone', 'text', 'quick'].includes(query.searchMode) ? query.searchMode : 'text',
    status: query.status ? String(query.status).trim() : undefined,
    company: query.company ? String(query.company).trim() : undefined,
    sort: query.sort ? String(query.sort).trim() : undefined,
    page: query.page,
    pageSize: query.pageSize || query.limit,
    paginated: query.paginated,
    includeFacets: query.includeFacets,
  };
}

function toCreateLeadDto(body = {}) {
  return {
    companyCode: String(body.companyCode || '').trim(),
    assignedEmployeePhone: String(body.assignedEmployeePhone || '').trim(),
    leadCompanyName: String(body.leadCompanyName || '').trim(),
    contactName: String(body.contactName || '').trim(),
    contactNumber: String(body.contactNumber || '').trim(),
    status: String(body.status || 'New').trim(),
    setLabel: String(body.setLabel || '').trim(),
    remarks: body.remarks,
  };
}

module.exports = {
  toLeadListQueryDto,
  toCreateLeadDto,
};

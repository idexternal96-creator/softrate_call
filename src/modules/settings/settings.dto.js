function toSettingsDto(body = {}) {
  return {
    companyName: String(body.companyName || '').trim(),
    leadStatuses: Array.isArray(body.leadStatuses) ? body.leadStatuses.map(String) : [],
    products: Array.isArray(body.products) ? body.products : [],
  };
}

module.exports = { toSettingsDto };

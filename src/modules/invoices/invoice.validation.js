const { ApiError } = require('../../common/errors/apiError');

function requireCompanyCode(input = {}) {
  if (!String(input.companyCode || '').trim()) {
    throw new ApiError(400, 'companyCode is required.');
  }
}

function validateInvoiceItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'At least one invoice item is required.');
  }
}

module.exports = {
  requireCompanyCode,
  validateInvoiceItems,
};

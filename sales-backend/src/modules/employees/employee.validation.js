const { ApiError } = require('../../common/errors/apiError');

function requireCompanyCode(input = {}) {
  if (!String(input.companyCode || '').trim()) {
    throw new ApiError(400, 'companyCode is required.');
  }
}

function validateEmployeeTags(tags) {
  if (!Array.isArray(tags)) {
    throw new ApiError(400, 'tags must be an array.');
  }
}

module.exports = {
  requireCompanyCode,
  validateEmployeeTags,
};

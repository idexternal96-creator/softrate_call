const { ApiError } = require('../../common/errors/apiError');

function requireCompanyCode(input = {}) {
  if (!String(input.companyCode || '').trim()) {
    throw new ApiError(400, 'companyCode is required.');
  }
}

module.exports = {
  requireCompanyCode,
};

const { ApiError } = require('../../common/errors/apiError');

function requireCompanyCode(input = {}) {
  if (!String(input.companyCode || '').trim()) {
    throw new ApiError(400, 'companyCode is required.');
  }
}

function requireEmployeeScope(input = {}) {
  requireCompanyCode(input);
  if (!String(input.phone || input.employeePhone || '').trim()) {
    throw new ApiError(400, 'companyCode and phone are required.');
  }
}

module.exports = {
  requireCompanyCode,
  requireEmployeeScope,
};

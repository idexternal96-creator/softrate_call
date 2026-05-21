const { ApiError } = require('../../common/errors/apiError');

function requireCompanyCode(query) {
  if (!query.companyCode) {
    throw new ApiError(400, 'companyCode is required.');
  }
}

function requireEmployeeScope(query) {
  requireCompanyCode(query);
  if (!query.phone) {
    throw new ApiError(400, 'companyCode and phone are required.');
  }
}

function validateCreateLead(dto) {
  if (!dto.companyCode || !dto.assignedEmployeePhone || !dto.leadCompanyName || !dto.contactNumber) {
    throw new ApiError(400, 'companyCode, assignedEmployeePhone, leadCompanyName, and contactNumber are required.');
  }
}

module.exports = {
  requireCompanyCode,
  requireEmployeeScope,
  validateCreateLead,
};

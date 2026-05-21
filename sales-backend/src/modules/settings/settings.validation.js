const { ApiError } = require('../../common/errors/apiError');

function requireCompanyCode(input = {}) {
  if (!String(input.companyCode || '').trim()) {
    throw new ApiError(400, 'companyCode is required.');
  }
}

function validateSettingsPayload(settings = {}) {
  if (settings.leadStatuses !== undefined && !Array.isArray(settings.leadStatuses)) {
    throw new ApiError(400, 'leadStatuses must be an array.');
  }
  if (settings.products !== undefined && !Array.isArray(settings.products)) {
    throw new ApiError(400, 'products must be an array.');
  }
}

module.exports = {
  requireCompanyCode,
  validateSettingsPayload,
};

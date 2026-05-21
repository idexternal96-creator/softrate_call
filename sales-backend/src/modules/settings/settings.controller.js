const { sendApiError } = require('../../common/errors/apiError');
const { toSettingsDto } = require('./settings.dto');
const { requireCompanyCode, validateSettingsPayload } = require('./settings.validation');

function validateSettingsParams(req, res, next) {
  try {
    requireCompanyCode({ companyCode: req.params.companyCode || req.query.companyCode });
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

function validateSettingsBody(req, res, next) {
  try {
    const dto = toSettingsDto(req.body || {});
    validateSettingsPayload(dto);
    req.settingsDto = dto;
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

module.exports = {
  validateSettingsBody,
  validateSettingsParams,
};

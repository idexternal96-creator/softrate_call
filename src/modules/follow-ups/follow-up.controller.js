const { sendApiError } = require('../../common/errors/apiError');
const { toFollowUpListQueryDto } = require('./follow-up.dto');
const { requireCompanyCode, requireEmployeeScope } = require('./follow-up.validation');

function validateAdminFollowUpQuery(req, res, next) {
  try {
    const dto = toFollowUpListQueryDto(req.query);
    requireCompanyCode(dto);
    req.followUpQuery = dto;
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

function validateEmployeeFollowUpQuery(req, res, next) {
  try {
    const dto = toFollowUpListQueryDto(req.query);
    requireEmployeeScope(dto);
    req.followUpQuery = dto;
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

module.exports = {
  validateAdminFollowUpQuery,
  validateEmployeeFollowUpQuery,
};

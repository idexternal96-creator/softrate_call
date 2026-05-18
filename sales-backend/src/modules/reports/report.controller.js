const { sendApiError } = require('../../common/errors/apiError');
const { toReportQueryDto } = require('./report.dto');
const { requireCompanyCode } = require('./report.validation');

function validateReportQuery(req, res, next) {
  try {
    const dto = toReportQueryDto(req.query);
    requireCompanyCode(dto);
    req.reportQuery = dto;
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

module.exports = {
  validateReportQuery,
};

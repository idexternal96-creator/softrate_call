const { sendApiError } = require('../../common/errors/apiError');
const { toEmployeeListQueryDto } = require('./employee.dto');
const { requireCompanyCode, validateEmployeeTags } = require('./employee.validation');

function validateEmployeeListQuery(req, res, next) {
  try {
    const dto = toEmployeeListQueryDto(req.query);
    requireCompanyCode(dto);
    req.employeeListQuery = dto;
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

function validateEmployeeTagsBody(req, res, next) {
  try {
    validateEmployeeTags(req.body?.tags);
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

module.exports = {
  validateEmployeeListQuery,
  validateEmployeeTagsBody,
};

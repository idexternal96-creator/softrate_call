const { sendApiError } = require('../../common/errors/apiError');
const { toQuotationHistoryQueryDto } = require('./quotation.dto');
const { requireCompanyCode } = require('./quotation.validation');

function validateQuotationHistoryQuery(req, res, next) {
  try {
    const dto = toQuotationHistoryQueryDto(req.query);
    requireCompanyCode(dto);
    req.quotationHistoryQuery = dto;
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

module.exports = {
  validateQuotationHistoryQuery,
};

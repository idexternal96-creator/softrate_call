const { sendApiError } = require('../../common/errors/apiError');
const { toInvoiceHistoryQueryDto } = require('./invoice.dto');
const { requireCompanyCode } = require('./invoice.validation');

function validateInvoiceHistoryQuery(req, res, next) {
  try {
    const dto = toInvoiceHistoryQueryDto(req.query);
    requireCompanyCode(dto);
    req.invoiceHistoryQuery = dto;
    return next();
  } catch (error) {
    return sendApiError(res, error);
  }
}

module.exports = {
  validateInvoiceHistoryQuery,
};

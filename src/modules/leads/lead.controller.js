const { sendApiError } = require('../../common/errors/apiError');
const { toLeadListQueryDto } = require('./lead.dto');
const { requireCompanyCode, requireEmployeeScope } = require('./lead.validation');
const leadService = require('./lead.service');

async function listAdminLeads(req, res) {
  try {
    const dto = toLeadListQueryDto(req.query);
    requireCompanyCode(dto);
    const response = await leadService.listLeads(dto);
    return res.status(200).json(response);
  } catch (error) {
    return sendApiError(res, error);
  }
}

async function listEmployeeLeads(req, res) {
  try {
    const dto = toLeadListQueryDto(req.query);
    requireEmployeeScope(dto);
    const response = await leadService.listLeads(dto);
    return res.status(200).json(response);
  } catch (error) {
    return sendApiError(res, error);
  }
}

module.exports = {
  listAdminLeads,
  listEmployeeLeads,
};

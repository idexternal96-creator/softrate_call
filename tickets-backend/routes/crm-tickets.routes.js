const express = require('express');
const { requireCrm } = require('../middleware/auth');
const {
  uploadFields,
  collectUploadedFiles,
  findAttachment,
  resolveAttachmentPath,
} = require('../services/attachmentService');
const {
  listCrmTickets,
  getCrmTicket,
  getCrmTicketDocument,
  updateCrmTicketStatus,
  addCrmRemark,
} = require('../services/ticketService');

const router = express.Router();

router.use(requireCrm);

router.get('/', async (req, res) => {
  try {
    const tickets = await listCrmTickets(req.crmUser, req.query);
    return res.json({ success: true, tickets });
  } catch (err) {
    console.error('[crm tickets list]', err);
    return res.status(500).json({ success: false, message: 'Failed to load tickets.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ticket = await getCrmTicket(req.crmUser, req.params.id);
    return res.json({ success: true, ticket });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to load ticket.' });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const ticket = await updateCrmTicketStatus(req.crmUser, req.params.id, req.body?.status);
    return res.json({ success: true, ticket });
  } catch (err) {
    console.error('[crm ticket status]', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to update ticket status.' });
  }
});

router.post('/:id/remarks', uploadFields(), async (req, res) => {
  try {
    const uploadedBy = req.crmUser.email || 'crm';
    const attachments = collectUploadedFiles(req, uploadedBy);
    const ticket = await addCrmRemark(req.crmUser, req.params.id, req.body?.message, attachments);
    return res.json({ success: true, ticket });
  } catch (err) {
    console.error('[crm ticket remark]', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to add remark.' });
  }
});

router.get('/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const ticket = await getCrmTicketDocument(req.crmUser, req.params.id);
    const attachment = findAttachment(ticket, req.params.attachmentId);
    const filePath = resolveAttachmentPath(attachment);
    if (!attachment || !filePath) return res.status(404).json({ success: false, message: 'Attachment not found.' });
    return res.download(filePath, attachment.originalName);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to download attachment.' });
  }
});

module.exports = router;

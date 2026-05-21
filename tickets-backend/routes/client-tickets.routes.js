const express = require('express');
const { requireClient } = require('../middleware/auth');
const {
  uploadFields,
  collectUploadedFiles,
  findAttachment,
  resolveAttachmentPath,
} = require('../services/attachmentService');
const {
  createClientTicket,
  listClientTickets,
  getClientTicket,
  getClientTicketDocument,
  addClientRemark,
} = require('../services/ticketService');

const router = express.Router();

router.use(requireClient);

router.get('/', async (req, res) => {
  try {
    const tickets = await listClientTickets(req.ticketClient, req.query);
    return res.json({ success: true, tickets });
  } catch (err) {
    console.error('[client tickets list]', err);
    return res.status(500).json({ success: false, message: 'Failed to load tickets.' });
  }
});

router.post('/', uploadFields(), async (req, res) => {
  try {
    const attachments = collectUploadedFiles(req, req.ticketClient.clientEmail);
    const ticket = await createClientTicket(req.ticketClient, req.body, attachments);
    return res.status(201).json({ success: true, ticket });
  } catch (err) {
    console.error('[client ticket create]', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to create ticket.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ticket = await getClientTicket(req.ticketClient, req.params.id);
    return res.json({ success: true, ticket });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to load ticket.' });
  }
});

router.post('/:id/remarks', uploadFields(), async (req, res) => {
  try {
    const attachments = collectUploadedFiles(req, req.ticketClient.clientEmail);
    const ticket = await addClientRemark(req.ticketClient, req.params.id, req.body?.message, attachments);
    return res.json({ success: true, ticket });
  } catch (err) {
    console.error('[client ticket remark]', err);
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to add remark.' });
  }
});

router.get('/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const ticket = await getClientTicketDocument(req.ticketClient, req.params.id);
    const attachment = findAttachment(ticket, req.params.attachmentId);
    const filePath = resolveAttachmentPath(attachment);
    if (!attachment || !filePath) return res.status(404).json({ success: false, message: 'Attachment not found.' });
    return res.download(filePath, attachment.originalName);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to download attachment.' });
  }
});

module.exports = router;

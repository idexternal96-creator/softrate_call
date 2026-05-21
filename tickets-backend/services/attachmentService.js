const path = require('path');
const fs = require('fs');
const multer = require('multer');

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const uploadRoot = path.resolve(
  process.env.TICKET_UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'tickets')
);

function ensureUploadRoot() {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

function safeName(value) {
  return String(value || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'file';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadRoot();
    cb(null, uploadRoot);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const base = safeName(path.basename(file.originalname || 'attachment', ext));
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${base}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    const err = new Error('Unsupported attachment type.');
    err.statusCode = 400;
    cb(err);
    return;
  }
  cb(null, true);
}

const maxMb = Number(process.env.TICKET_ATTACHMENT_MAX_MB || 10);

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxMb * 1024 * 1024, files: 5 },
});

function uploadFields() {
  return upload.fields([
    { name: 'attachment', maxCount: 1 },
    { name: 'attachments', maxCount: 5 },
  ]);
}

function collectUploadedFiles(req, uploadedBy) {
  const groups = req.files || {};
  const files = [
    ...(groups.attachment || []),
    ...(groups.attachments || []),
  ];
  return files.map((file) => ({
    fileName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    path: file.path,
    uploadedBy,
    uploadedAt: new Date(),
  }));
}

function findAttachment(ticket, attachmentId) {
  const direct = ticket.attachments?.find((attachment) => String(attachment._id) === String(attachmentId));
  if (direct) return direct;
  for (const remark of ticket.remarks || []) {
    const nested = remark.attachments?.find((attachment) => String(attachment._id) === String(attachmentId));
    if (nested) return nested;
  }
  return null;
}

function resolveAttachmentPath(attachment) {
  if (!attachment?.path) return '';
  const resolved = path.resolve(attachment.path);
  if (!resolved.startsWith(uploadRoot)) return '';
  return resolved;
}

module.exports = {
  uploadFields,
  collectUploadedFiles,
  findAttachment,
  resolveAttachmentPath,
};

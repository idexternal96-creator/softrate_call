function normalizeRemarks(remarks) {
  if (Array.isArray(remarks)) {
    return remarks.map((remark) => String(remark).trim()).filter(Boolean);
  }

  return String(remarks || '')
    .split('\n')
    .map((remark) => remark.trim())
    .filter(Boolean);
}

function mapLeadDocument(document) {
  if (!document) return document;
  const source = typeof document.toObject === 'function' ? document.toObject() : document;

  return {
    ...source,
    remarks: normalizeRemarks(source.remarks),
  };
}

module.exports = {
  normalizeRemarks,
  mapLeadDocument,
};

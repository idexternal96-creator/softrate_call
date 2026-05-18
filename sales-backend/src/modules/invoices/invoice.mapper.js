function mapInvoiceDocument(document) {
  if (!document) return document;
  const source = typeof document.toObject === 'function' ? document.toObject() : document;
  return {
    ...source,
    total: Number(source.total || 0),
  };
}

module.exports = { mapInvoiceDocument };

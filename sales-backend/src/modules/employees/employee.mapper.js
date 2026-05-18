function mapEmployeeDocument(document) {
  if (!document) return document;
  const source = typeof document.toObject === 'function' ? document.toObject() : document;
  return {
    ...source,
    tags: Array.isArray(source.tags) ? source.tags : [],
  };
}

module.exports = { mapEmployeeDocument };

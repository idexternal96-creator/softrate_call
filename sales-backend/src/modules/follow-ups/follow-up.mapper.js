function mapFollowUpDocument(document) {
  if (!document) return document;
  const source = typeof document.toObject === 'function' ? document.toObject() : document;
  return {
    ...source,
    lastInteraction: source.updatedAt || source.createdAt || null,
  };
}

module.exports = { mapFollowUpDocument };

function mapSettingsDocument(document = {}) {
  const source = typeof document.toObject === 'function' ? document.toObject() : document;
  return {
    companyName: source.companyName || '',
    leadStatuses: Array.isArray(source.leadStatuses) ? source.leadStatuses : [],
    interestedPageStatuses: Array.isArray(source.interestedPageStatuses) ? source.interestedPageStatuses : [],
    dnpPageStatuses: Array.isArray(source.dnpPageStatuses) ? source.dnpPageStatuses : [],
    convertedPageStatuses: Array.isArray(source.convertedPageStatuses) ? source.convertedPageStatuses : [],
    products: Array.isArray(source.products) ? source.products : [],
    productRemarks: Array.isArray(source.productRemarks) ? source.productRemarks : [],
  };
}

module.exports = {
  mapSettingsDocument,
};

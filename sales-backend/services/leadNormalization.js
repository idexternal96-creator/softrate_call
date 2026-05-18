function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeRemarks(remarks) {
  const items = Array.isArray(remarks)
    ? remarks
    : remarks
      ? [remarks]
      : [];

  return items
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function enrichLeadForStorage(lead = {}, options = {}) {
  const companyCode = String(lead.companyCode ?? '').trim();
  const assignedEmployeePhone = String(lead.assignedEmployeePhone ?? '').trim();
  const leadCompanyName = String(lead.leadCompanyName ?? '').trim();
  const contactName = String(lead.contactName ?? '').trim();
  const contactNumber = String(lead.contactNumber ?? '').trim();
  const setLabel = String(lead.setLabel ?? '').trim();
  const directorEmailAddress = String(lead.directorEmailAddress ?? '').trim();
  const companyDescription = String(lead.companyDescription ?? '').trim();
  const mainDivisionDescription = String(lead.mainDivisionDescription ?? '').trim();
  const remarks = normalizeRemarks(lead.remarks);

  return {
    ...lead,
    companyCode,
    assignedEmployeePhone,
    leadCompanyName,
    contactName,
    contactNumber,
    setLabel,
    directorEmailAddress,
    companyDescription,
    mainDivisionDescription,
    remarks,
    contactNumberNormalized: normalizePhone(contactNumber),
    leadCompanyNameLower: normalizeText(leadCompanyName),
    contactNameLower: normalizeText(contactName),
    directorEmailLower: normalizeText(directorEmailAddress),
    setLabelLower: normalizeText(setLabel),
    isArchived: lead.isArchived ?? false,
    importBatchId: options.importBatchId ?? lead.importBatchId ?? null,
    sheetOrder: Number.isFinite(lead.sheetOrder) ? lead.sheetOrder : Number(lead.sheetOrder) || 0,
  };
}

function buildLeadDedupKey(lead = {}) {
  return [
    String(lead.companyCode ?? '').trim(),
    String(lead.assignedEmployeePhone ?? '').trim(),
    normalizePhone(lead.contactNumber),
    normalizeText(lead.leadCompanyName),
  ].join('__');
}

module.exports = {
  buildLeadDedupKey,
  enrichLeadForStorage,
  normalizePhone,
  normalizeRemarks,
  normalizeText,
};

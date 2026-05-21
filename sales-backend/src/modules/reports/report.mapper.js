function mapReportRow(row = {}) {
  return {
    id: String(row.phone || row.id || ''),
    label: String(row.name || row.label || row.phone || 'Employee'),
    value: Number(row.total || row.value || 0),
    period: String(row.period || ''),
  };
}

module.exports = {
  mapReportRow,
};

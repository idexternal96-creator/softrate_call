const { hashObject, invalidatePrefix } = require('./cacheService');

const LEAD_CACHE_TTLS = {
  list: 45,
  facets: 120,
};

function buildEmployeeLeadListKey(companyCode, phone, params) {
  return `lead:list:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

function buildAdminLeadListKey(companyCode, params) {
  return `lead:list:admin:${companyCode}:${hashObject(params)}`;
}

function buildEmployeeSetKey(companyCode, phone, params) {
  return `lead:sets:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

function buildAdminSetKey(companyCode, params) {
  return `lead:sets:admin:${companyCode}:${hashObject(params)}`;
}

function buildEmployeeCompanyKey(companyCode, phone, params) {
  return `lead:companies:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

function buildAdminCompanyKey(companyCode, params) {
  return `lead:companies:admin:${companyCode}:${hashObject(params)}`;
}

function buildEmployeeStatusCountKey(companyCode, phone, params) {
  return `lead:status-counts:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

async function invalidateLeadCaches({ companyCode, phone }) {
  const prefixes = [
    `lead:list:admin:${companyCode}:`,
    `lead:sets:admin:${companyCode}:`,
    `lead:companies:admin:${companyCode}:`,
  ];

  if (phone) {
    prefixes.push(
      `lead:list:employee:${companyCode}:${phone}:`,
      `lead:sets:employee:${companyCode}:${phone}:`,
      `lead:companies:employee:${companyCode}:${phone}:`,
      `lead:status-counts:employee:${companyCode}:${phone}:`,
    );
  } else {
    prefixes.push(
      `lead:list:employee:${companyCode}:`,
      `lead:sets:employee:${companyCode}:`,
      `lead:companies:employee:${companyCode}:`,
      `lead:status-counts:employee:${companyCode}:`,
    );
  }

  await Promise.all(prefixes.map((prefix) => invalidatePrefix(prefix)));
}

module.exports = {
  LEAD_CACHE_TTLS,
  buildAdminCompanyKey,
  buildAdminLeadListKey,
  buildAdminSetKey,
  buildEmployeeCompanyKey,
  buildEmployeeLeadListKey,
  buildEmployeeSetKey,
  buildEmployeeStatusCountKey,
  invalidateLeadCaches,
};

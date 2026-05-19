const { hashObject, invalidatePrefix } = require('./cacheService');

const LEAD_CACHE_TTLS = {
  list: 45,
  facets: 120,
  companyContacts: 120,
};
const LEAD_CACHE_NAMESPACE = 'lead:v2';

function buildEmployeeLeadListKey(companyCode, phone, params) {
  return `${LEAD_CACHE_NAMESPACE}:list:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

function buildAdminLeadListKey(companyCode, params) {
  return `${LEAD_CACHE_NAMESPACE}:list:admin:${companyCode}:${hashObject(params)}`;
}

function buildEmployeeSetKey(companyCode, phone, params) {
  return `${LEAD_CACHE_NAMESPACE}:sets:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

function buildAdminSetKey(companyCode, params) {
  return `${LEAD_CACHE_NAMESPACE}:sets:admin:${companyCode}:${hashObject(params)}`;
}

function buildEmployeeCompanyKey(companyCode, phone, params) {
  return `${LEAD_CACHE_NAMESPACE}:companies:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

function buildEmployeeCompanyContactsKey(companyCode, phone, params) {
  return `${LEAD_CACHE_NAMESPACE}:company-contacts:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

function buildAdminCompanyKey(companyCode, params) {
  return `${LEAD_CACHE_NAMESPACE}:companies:admin:${companyCode}:${hashObject(params)}`;
}

function buildEmployeeStatusCountKey(companyCode, phone, params) {
  return `${LEAD_CACHE_NAMESPACE}:status-counts:employee:${companyCode}:${phone}:${hashObject(params)}`;
}

async function invalidateLeadCaches({ companyCode, phone }) {
  const prefixes = [
    `${LEAD_CACHE_NAMESPACE}:list:admin:${companyCode}:`,
    `${LEAD_CACHE_NAMESPACE}:sets:admin:${companyCode}:`,
    `${LEAD_CACHE_NAMESPACE}:companies:admin:${companyCode}:`,
    `lead:list:admin:${companyCode}:`,
    `lead:sets:admin:${companyCode}:`,
    `lead:companies:admin:${companyCode}:`,
  ];

  if (phone) {
    prefixes.push(
      `${LEAD_CACHE_NAMESPACE}:list:employee:${companyCode}:${phone}:`,
      `${LEAD_CACHE_NAMESPACE}:sets:employee:${companyCode}:${phone}:`,
      `${LEAD_CACHE_NAMESPACE}:companies:employee:${companyCode}:${phone}:`,
      `${LEAD_CACHE_NAMESPACE}:company-contacts:employee:${companyCode}:${phone}:`,
      `${LEAD_CACHE_NAMESPACE}:status-counts:employee:${companyCode}:${phone}:`,
      `lead:list:employee:${companyCode}:${phone}:`,
      `lead:sets:employee:${companyCode}:${phone}:`,
      `lead:companies:employee:${companyCode}:${phone}:`,
      `lead:status-counts:employee:${companyCode}:${phone}:`,
    );
  } else {
    prefixes.push(
      `${LEAD_CACHE_NAMESPACE}:list:employee:${companyCode}:`,
      `${LEAD_CACHE_NAMESPACE}:sets:employee:${companyCode}:`,
      `${LEAD_CACHE_NAMESPACE}:companies:employee:${companyCode}:`,
      `${LEAD_CACHE_NAMESPACE}:company-contacts:employee:${companyCode}:`,
      `${LEAD_CACHE_NAMESPACE}:status-counts:employee:${companyCode}:`,
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
  buildEmployeeCompanyContactsKey,
  buildEmployeeCompanyKey,
  buildEmployeeLeadListKey,
  buildEmployeeSetKey,
  buildEmployeeStatusCountKey,
  invalidateLeadCaches,
};

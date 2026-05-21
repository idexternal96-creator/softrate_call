const { normalizeDomainName } = require('./amcService');

const HOSTINGER_API_BASE_URL = process.env.HOSTINGER_API_BASE_URL || 'https://developers.hostinger.com';

function hostingerToken() {
  return String(process.env.HOSTINGER_API_TOKEN || '').trim();
}

function ensureHostingerConfigured() {
  if (!hostingerToken()) {
    const error = new Error('HOSTINGER_API_TOKEN is not configured.');
    error.statusCode = 503;
    throw error;
  }
}

async function hostingerRequest(path) {
  ensureHostingerConfigured();

  const response = await fetch(`${HOSTINGER_API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${hostingerToken()}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `Hostinger API request failed with ${response.status}.`);
    error.statusCode = response.status;
    error.response = body;
    throw error;
  }

  return body;
}

function parseHostingerDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeHostingerDomain(resource, details = null) {
  const domainName = normalizeDomainName(details?.domain || resource?.domain);
  const registeredAt = parseHostingerDate(details?.registered_at);
  const createdAt = parseHostingerDate(details?.created_at || resource?.created_at);
  const expiresAt = parseHostingerDate(details?.expires_at || resource?.expires_at);

  return {
    hostingerDomainId: resource?.id ? String(resource.id) : '',
    domainName,
    type: resource?.type || '',
    hostingerStatus: details?.status || resource?.status || '',
    domainPurchaseDate: registeredAt || createdAt,
    hostingerRegisteredAt: registeredAt,
    hostingerCreatedAt: createdAt,
    hostingerExpiresAt: expiresAt,
    raw: details || resource,
  };
}

async function fetchHostingerDomains({ includeDetails = true } = {}) {
  const resources = await hostingerRequest('/api/domains/v1/portfolio');
  const list = Array.isArray(resources) ? resources : [];

  if (!includeDetails) {
    return list
      .map((resource) => normalizeHostingerDomain(resource))
      .filter((domain) => domain.domainName);
  }

  const domains = [];
  for (const resource of list) {
    if (!resource?.domain) continue;
    try {
      const details = await hostingerRequest(`/api/domains/v1/portfolio/${encodeURIComponent(resource.domain)}`);
      domains.push(normalizeHostingerDomain(resource, details));
    } catch (err) {
      domains.push({
        ...normalizeHostingerDomain(resource),
        detailError: err.message,
      });
    }
  }
  return domains.filter((domain) => domain.domainName);
}

module.exports = {
  fetchHostingerDomains,
};

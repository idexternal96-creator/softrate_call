const { hashObject, invalidatePrefix } = require('./cacheService');

const CALLLOG_CACHE_TTLS = {
  summary: 180,
  employees: 120,
  employee: 120,
  details: 60,
  timeline: 120,
  leadCounts: 180,
};

function buildCalllogCacheKey(prefix, params) {
  return `${prefix}:${hashObject(params)}`;
}

async function invalidateCalllogCaches({ companyCode, phone }) {
  const prefixes = [
    `calllog:summary:${companyCode}:`,
    `calllog:employees:${companyCode}:`,
    `calllog:timeline:${companyCode}:`,
    `calllog:lead-counts:${companyCode}:`,
  ];

  if (phone) {
    prefixes.push(
      `calllog:employee:${companyCode}:${phone}:`,
      `calllog:details:${companyCode}:${phone}:`,
      `calllog:timeline:${companyCode}:${phone}:`,
    );
  } else {
    prefixes.push(
      `calllog:employee:${companyCode}:`,
      `calllog:details:${companyCode}:`,
      `calllog:timeline:${companyCode}:`,
    );
  }

  await Promise.all(prefixes.map((prefix) => invalidatePrefix(prefix)));
}

module.exports = {
  CALLLOG_CACHE_TTLS,
  buildCalllogCacheKey,
  invalidateCalllogCaches,
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parsePageQuery(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requestedPageSize = Number.parseInt(query.pageSize || query.limit, 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));

  return {
    page,
    pageSize,
    limit: pageSize,
    skip: (page - 1) * pageSize,
    isPaginated: query.paginated === true || query.paginated === 'true' || query.page !== undefined || query.limit !== undefined,
  };
}

function buildPageResponse({ items, total, page, pageSize }) {
  const count = Array.isArray(items) ? items.length : 0;
  const safeTotal = Number.isFinite(total) ? total : count;

  return {
    items: items || [],
    page,
    pageSize,
    total: safeTotal,
    hasMore: page * pageSize < safeTotal,
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parsePageQuery,
  buildPageResponse,
};

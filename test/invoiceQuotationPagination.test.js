const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePageQuery, buildPageResponse } = require('../src/common/pagination/pagination');

test('history endpoints use numbered pagination metadata', () => {
  const pagination = parsePageQuery({ page: '3', pageSize: '20' });
  assert.equal(pagination.page, 3);
  assert.equal(pagination.pageSize, 20);
  assert.equal(pagination.skip, 40);
  assert.equal(pagination.isPaginated, true);

  const response = buildPageResponse({
    items: Array.from({ length: 20 }, (_, id) => ({ id })),
    total: 62,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });

  assert.equal(response.hasMore, true);
  assert.equal(response.total, 62);
});

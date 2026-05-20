const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePageQuery, buildPageResponse } = require('../src/common/pagination/pagination');
const { toLeadListQueryDto } = require('../src/modules/leads/lead.dto');
const { mapLeadDocument, normalizeRemarks } = require('../src/modules/leads/lead.mapper');
const { canAccessScope, ROLES, DATA_SCOPES } = require('../src/common/permissions/roles');

test('parsePageQuery defaults operational lists to 20 records', () => {
  const result = parsePageQuery({ page: '2', paginated: 'true' });

  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 20);
  assert.equal(result.skip, 20);
  assert.equal(result.limit, 20);
  assert.equal(result.isPaginated, true);
});

test('buildPageResponse reports hasMore from total and page size', () => {
  const result = buildPageResponse({
    items: [{ id: 1 }],
    total: 25,
    page: 1,
    pageSize: 20,
  });

  assert.equal(result.hasMore, true);
  assert.equal(result.total, 25);
});

test('lead dto trims route boundary inputs', () => {
  const result = toLeadListQueryDto({
    companyCode: ' STP ',
    phone: ' 999 ',
    division: ' MSME ',
    search: ' Acme ',
    searchMode: 'phone',
  });

  assert.deepEqual(result, {
    companyCode: 'STP',
    phone: '999',
    setLabel: undefined,
    division: 'MSME',
    search: 'Acme',
    searchMode: 'phone',
    status: undefined,
    company: undefined,
    sort: undefined,
    page: undefined,
    pageSize: undefined,
    paginated: undefined,
    includeFacets: undefined,
  });
});

test('lead dto preserves quick search mode for employee global search', () => {
  const result = toLeadListQueryDto({
    companyCode: 'STP',
    phone: '999',
    search: 'Acme',
    searchMode: 'quick',
  });

  assert.equal(result.searchMode, 'quick');
});

test('lead mapper normalizes newline remarks', () => {
  assert.deepEqual(normalizeRemarks(' first\n\nsecond '), ['first', 'second']);

  const mapped = mapLeadDocument({
    _id: '1',
    leadCompanyName: 'Acme',
    remarks: ' first\nsecond ',
  });

  assert.deepEqual(mapped.remarks, ['first', 'second']);
});

test('employee role is restricted to own or assigned scope', () => {
  assert.equal(canAccessScope(ROLES.employee, DATA_SCOPES.assigned), true);
  assert.equal(canAccessScope(ROLES.employee, DATA_SCOPES.all), false);
  assert.equal(canAccessScope(ROLES.admin, DATA_SCOPES.all), true);
});

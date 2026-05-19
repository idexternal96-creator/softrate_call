const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLeadSearchQuery,
  parsePagination,
} = require('../services/leadQueryService');

test('parsePagination defaults and caps page size', () => {
  const parsed = parsePagination({ page: '2', pageSize: '500' });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 200);
  assert.equal(parsed.skip, 200);
  assert.equal(parsed.isPaginated, true);
});

test('parsePagination keeps architecture page size for company rail requests', () => {
  const parsed = parsePagination({ page: '1', pageSize: '20', paginated: 'true' });
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 20);
  assert.equal(parsed.skip, 0);
  assert.equal(parsed.isPaginated, true);
});

test('buildLeadSearchQuery handles phone search', () => {
  const result = buildLeadSearchQuery({
    companyCode: 'DV01',
    phone: '9999999999',
    query: { search: '+91 98765 43210', searchMode: 'phone' },
  });

  assert.equal(result.mongoQuery.companyCode, 'DV01');
  assert.equal(result.mongoQuery.assignedEmployeePhone, '9999999999');
  assert.equal(result.mongoQuery.contactNumberNormalized, '9876543210');
  assert.equal(result.searchStrategy, 'phone');
});

test('buildLeadSearchQuery uses prefix search for short text', () => {
  const result = buildLeadSearchQuery({
    companyCode: 'DV01',
    phone: '9999999999',
    query: { search: 'ac' },
  });

  assert.equal(result.searchStrategy, 'prefix');
  assert.ok(Array.isArray(result.mongoQuery.$or));
  assert.equal(result.mongoQuery.$or.length > 0, true);
});

test('buildLeadSearchQuery uses indexed quick prefix search when requested', () => {
  const result = buildLeadSearchQuery({
    companyCode: 'DV01',
    phone: '9999999999',
    query: { search: 'Kshoma Green', searchMode: 'quick' },
  });

  assert.equal(result.searchStrategy, 'quick_prefix');
  assert.ok(Array.isArray(result.mongoQuery.$or));
  assert.deepEqual(result.sort, { sheetOrder: 1, createdAt: 1, _id: 1 });
  assert.equal(result.mongoQuery.$or.some((clause) => !!clause.leadCompanyNameLower), true);
  assert.equal(result.mongoQuery.$or.some((clause) => !!clause.leadCompanyName), false);
  assert.equal(result.mongoQuery.$or.some((clause) => !!clause.contactName), false);
  assert.equal(result.mongoQuery.$or.some((clause) => !!clause.setLabel), false);
  assert.equal(result.mongoQuery.$or.some((clause) => clause.status === 'Kshoma Green'), true);
});

test('buildLeadSearchQuery uses text search for longer text queries', () => {
  const result = buildLeadSearchQuery({
    companyCode: 'DV01',
    query: { search: 'tile distributor mumbai' },
  });

  assert.equal(result.searchStrategy, 'text');
  assert.deepEqual(result.mongoQuery.$text, { $search: 'tile distributor mumbai' });
  assert.ok(result.projection);
});

test('buildLeadSearchQuery applies employee lead view filters', () => {
  const result = buildLeadSearchQuery({
    companyCode: 'DV01',
    phone: '9999999999',
    query: {
      statuses: 'Interested, Converted',
      isFavourite: 'true',
      updatedFrom: '2026-05-13T00:00:00.000Z',
      updatedTo: '2026-05-14T00:00:00.000Z',
    },
  });

  assert.deepEqual(result.mongoQuery.status, { $in: ['Interested', 'Converted'] });
  assert.equal(result.mongoQuery.isFavourite, true);
  assert.equal(result.mongoQuery.updatedAt.$gte.toISOString(), '2026-05-13T00:00:00.000Z');
  assert.equal(result.mongoQuery.updatedAt.$lt.toISOString(), '2026-05-14T00:00:00.000Z');
});

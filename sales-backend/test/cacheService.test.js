const test = require('node:test');
const assert = require('node:assert/strict');

const { getOrSet, getJson, invalidatePrefix, setJson } = require('../services/cacheService');

test('cacheService stores and retrieves values from the in-process fallback cache', async () => {
  await setJson('test:key:1', { ok: true }, 60);
  const value = await getJson('test:key:1');
  assert.deepEqual(value, { ok: true });
});

test('cacheService getOrSet returns cached value on repeated access', async () => {
  let calls = 0;
  const first = await getOrSet('test:key:2', 60, async () => {
    calls += 1;
    return { value: 42 };
  });
  const second = await getOrSet('test:key:2', 60, async () => {
    calls += 1;
    return { value: 99 };
  });

  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
  assert.equal(calls, 1);
  assert.deepEqual(second.value, { value: 42 });
});

test('cacheService invalidatePrefix clears matching entries', async () => {
  await setJson('test:prefix:a', { a: 1 }, 60);
  await setJson('test:prefix:b', { b: 1 }, 60);
  await invalidatePrefix('test:prefix:');

  assert.equal(await getJson('test:prefix:a'), null);
  assert.equal(await getJson('test:prefix:b'), null);
});

const Lead = require('../models/Lead');

function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function shouldEnsureLeadIndexes() {
  return parseBooleanEnv(process.env.LEAD_INDEX_SYNC_ON_STARTUP) ||
    parseBooleanEnv(process.env.MONGO_SYNC_INDEXES);
}

function indexKeySignature(key) {
  return JSON.stringify(key || {});
}

function isTextIndexKey(key) {
  return Object.values(key || {}).some((value) => value === 'text');
}

function indexExists(expectedKey, actualIndexes) {
  if (!isTextIndexKey(expectedKey)) {
    const expectedSignature = indexKeySignature(expectedKey);
    return actualIndexes.some((index) => indexKeySignature(index.key) === expectedSignature);
  }

  const expectedFields = Object.entries(expectedKey)
    .filter(([, value]) => value === 'text')
    .map(([field]) => field);

  return actualIndexes.some((index) => (
    index.weights &&
    expectedFields.every((field) => Object.prototype.hasOwnProperty.call(index.weights, field))
  ));
}

async function ensureLeadIndexes(logger = console) {
  const startedAt = Date.now();
  logger.info('⏳ Ensuring lead indexes exist...');

  await Lead.createIndexes();

  const expected = Lead.schema.indexes().map(([key]) => key);
  const actual = await Lead.collection.indexes();
  const missing = expected.filter((key) => !indexExists(key, actual));

  if (missing.length) {
    throw new Error(`Lead index verification failed. Missing index keys: ${missing.map(indexKeySignature).join(', ')}`);
  }

  logger.info(`✅ Lead indexes ready (${expected.length} schema indexes, ${Date.now() - startedAt}ms)`);

  return {
    expectedCount: expected.length,
    actualCount: actual.length,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = {
  ensureLeadIndexes,
  parseBooleanEnv,
  shouldEnsureLeadIndexes,
};

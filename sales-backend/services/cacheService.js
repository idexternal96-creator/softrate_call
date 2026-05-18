const crypto = require('crypto');
const { getRedisClient, isRedisEnabled } = require('./redisClient');

const memoryCache = new Map();

function now() {
  return Date.now();
}

function hashObject(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex');
}

function getMemoryValue(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setMemoryValue(key, value, ttlSeconds) {
  memoryCache.set(key, {
    value,
    expiresAt: now() + (ttlSeconds * 1000),
  });
}

async function getJson(key) {
  const redis = getRedisClient();
  if (redis && isRedisEnabled()) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.warn(`⚠️ Cache read failed for ${key}: ${err.message}`);
    }
  }

  return getMemoryValue(key);
}

async function setJson(key, value, ttlSeconds) {
  const redis = getRedisClient();
  if (redis && isRedisEnabled()) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      console.warn(`⚠️ Cache write failed for ${key}: ${err.message}`);
    }
  }

  setMemoryValue(key, value, ttlSeconds);
}

async function deleteKey(key) {
  const redis = getRedisClient();
  if (redis && isRedisEnabled()) {
    try {
      await redis.del(key);
    } catch (err) {
      console.warn(`⚠️ Cache delete failed for ${key}: ${err.message}`);
    }
  }
  memoryCache.delete(key);
}

async function invalidatePrefix(prefix) {
  const redis = getRedisClient();
  if (redis && isRedisEnabled()) {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
        cursor = nextCursor;
      } while (cursor !== '0');
    } catch (err) {
      console.warn(`⚠️ Cache prefix invalidation failed for ${prefix}: ${err.message}`);
    }
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

async function getOrSet(key, ttlSeconds, loader) {
  const cached = await getJson(key);
  if (cached !== null) {
    return { cacheHit: true, value: cached };
  }

  const value = await loader();
  await setJson(key, value, ttlSeconds);
  return { cacheHit: false, value };
}

module.exports = {
  deleteKey,
  getJson,
  getOrSet,
  hashObject,
  invalidatePrefix,
  setJson,
};

let Redis = null;

try {
  // Optional dependency at runtime. The app must still boot if Redis is not configured.
  Redis = require('ioredis');
} catch (err) {
  Redis = null;
}

const REDIS_URL = (process.env.REDIS_URL || '').trim();
const redisEnabled = Boolean(Redis && REDIS_URL);
let sharedClient = null;
let subscriberClient = null;
let queueConnection = null;
let configLogged = false;

function logRedisState(message) {
  if (configLogged) return;
  configLogged = true;
  console.log(message);
}

function createClient(role) {
  if (!redisEnabled) {
    if (!configLogged) {
      logRedisState('ℹ️ Redis disabled. Falling back to in-process cache/event handling.');
    }
    return null;
  }

  const options = {
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: role === 'subscriber' ? null : 1,
    connectTimeout: 5000,
  };

  const client = new Redis(REDIS_URL, options);
  client.on('error', (err) => {
    console.warn(`⚠️ Redis ${role} error: ${err.message}`);
  });
  client.on('ready', () => {
    console.log(`✅ Redis ${role} connected`);
  });
  return client;
}

function getRedisClient() {
  if (!sharedClient) {
    sharedClient = createClient('client');
  }
  return sharedClient;
}

function getRedisSubscriber() {
  if (!subscriberClient) {
    subscriberClient = createClient('subscriber');
  }
  return subscriberClient;
}

function getBullConnection() {
  if (!redisEnabled) return null;
  if (!queueConnection) {
    queueConnection = {
      host: undefined,
      port: undefined,
      username: undefined,
      password: undefined,
      tls: undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      connectionName: 'dealvoice-bullmq',
    };

    queueConnection = { ...queueConnection, url: REDIS_URL };
  }
  return queueConnection;
}

module.exports = {
  getBullConnection,
  getRedisClient,
  getRedisSubscriber,
  isRedisEnabled: () => redisEnabled,
  redisUrl: REDIS_URL,
};

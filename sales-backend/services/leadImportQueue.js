let bullMq = null;

try {
  bullMq = require('bullmq');
} catch (err) {
  bullMq = null;
}

const { redisUrl } = require('./redisClient');
const { processLeadImportBatch } = require('./leadImportService');

const QUEUE_NAME = 'lead-imports';
let queue = null;
let worker = null;

function canUseQueue() {
  return Boolean(bullMq && redisUrl);
}

function ensureQueue() {
  if (!canUseQueue()) return null;
  if (queue) return queue;

  const { Queue, Worker } = bullMq;
  const IORedis = require('ioredis');
  const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  queue = new Queue(QUEUE_NAME, { connection: queueConnection });
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { batchId, leads } = job.data;
      return processLeadImportBatch(batchId, leads);
    },
    { connection: workerConnection, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[lead import worker] Job ${job?.id || 'unknown'} failed:`, err);
  });

  return queue;
}

async function queueLeadImportJob(payload) {
  const activeQueue = ensureQueue();
  if (!activeQueue) return null;

  return activeQueue.add(
    'lead-import',
    payload,
    {
      removeOnComplete: 20,
      removeOnFail: 20,
      attempts: 1,
    }
  );
}

module.exports = {
  canUseQueue,
  queueLeadImportJob,
};

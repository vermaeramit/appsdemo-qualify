import { createDb } from '@qualify/db';
import { parseAllowlist, parseMasterKey, WhatsAppClient } from '@qualify/integrations';
import { metaEventJobSchema, QUEUES } from '@qualify/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadWorkerEnv } from './env.ts';
import { createLogger } from './logger.ts';
import { processMetaEvent } from './meta-events/process-meta-event.ts';

const env = loadWorkerEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const { db, pool } = createDb(env.APP_DATABASE_URL);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const allowlist = parseAllowlist(env.DEV_ALLOWED_NUMBERS);
const isProduction = env.NODE_ENV === 'production';
const masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;

if (!isProduction) {
  logger.info(
    { allowedNumbers: allowlist.length },
    allowlist.length
      ? 'Dev safety switch ON: replying only to DEV_ALLOWED_NUMBERS'
      : 'Dev safety switch ON: DEV_ALLOWED_NUMBERS is empty, the bot will not reply to anyone',
  );
}
if (!masterKey) logger.warn('ENCRYPTION_MASTER_KEY not set: messages are stored but not answered');

const metaEventsWorker = new Worker(
  QUEUES.metaEvents,
  async (job) => {
    const { eventId } = metaEventJobSchema.parse(job.data);
    await processMetaEvent(eventId, {
      db,
      logger,
      allowlist,
      isProduction,
      masterKey,
      createClient: (accessToken) =>
        new WhatsAppClient({
          accessToken,
          ...(env.META_GRAPH_VERSION ? { graphVersion: env.META_GRAPH_VERSION } : {}),
        }),
    });
  },
  { connection, concurrency: 10 },
);

metaEventsWorker.on('failed', (job, error) => {
  logger.error(
    { jobId: job?.id, attempts: job?.attemptsMade, err: error },
    'Meta event job failed',
  );
});

logger.info({ queues: [QUEUES.metaEvents] }, 'Worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down`);
  await metaEventsWorker.close();
  await pool.end();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

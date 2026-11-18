import './load-env.ts';
import { createDb } from '@qualify/db';
import {
  ALLOW_ALL,
  createLlmClient,
  parseAllowlist,
  parseMasterKey,
  WhatsAppClient,
} from '@qualify/integrations';
import {
  CONTACT_QUEUE,
  contactJobSchema,
  metaEventJobSchema,
  QUEUES,
  RESPOND_QUEUE,
  type RespondJob,
  respondJobSchema,
} from '@qualify/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ContactBusyError, processContact } from './agent/contact.ts';
import { LeadBusyError, processRespond } from './agent/respond.ts';
import { loadWorkerEnv } from './env.ts';
import { createRedisLock } from './lock.ts';
import { createLogger } from './logger.ts';
import { processMetaEvent } from './meta-events/process-meta-event.ts';

const env = loadWorkerEnv();
const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
const { db, pool } = createDb(env.APP_DATABASE_URL);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const allowlist = parseAllowlist(env.DEV_ALLOWED_NUMBERS);
const isProduction = env.NODE_ENV === 'production';
const masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;
const llm = env.OPENAI_API_KEY
  ? createLlmClient({ provider: env.LLM_PROVIDER, apiKey: env.OPENAI_API_KEY })
  : null;
const whatsapp = (accessToken: string) =>
  new WhatsAppClient({
    accessToken,
    ...(env.META_GRAPH_VERSION ? { graphVersion: env.META_GRAPH_VERSION } : {}),
  });

if (!isProduction) {
  if (allowlist.includes(ALLOW_ALL)) {
    logger.warn('Dev safety switch OFF (DEV_ALLOWED_NUMBERS=*): messaging every lead');
  } else {
    logger.info(
      { allowedNumbers: allowlist.length },
      allowlist.length
        ? 'Dev safety switch ON: replying only to DEV_ALLOWED_NUMBERS'
        : 'Dev safety switch ON: DEV_ALLOWED_NUMBERS is empty, the bot will not reply to anyone',
    );
  }
}
if (!masterKey) logger.warn('ENCRYPTION_MASTER_KEY not set: messages are stored but not answered');
logger.info(
  llm ? { model: env.AI_MODEL_CHAT, reasoningEffort: env.AI_REASONING_EFFORT } : { model: null },
  llm ? 'AI agent enabled' : 'AI agent disabled: OPENAI_API_KEY not set',
);

const respondQueue = new Queue<RespondJob>(RESPOND_QUEUE, { connection });

/**
 * Debounced enqueue: every new message replaces the pending job and restarts the quiet period,
 * so a burst of messages gets one reply. If a reply is being generated, the last job is kept.
 */
async function enqueueRespond(job: RespondJob, delayMs = env.AI_DEBOUNCE_MS): Promise<void> {
  await respondQueue.add('respond', job, {
    delay: delayMs,
    deduplication: {
      id: `respond:${job.leadId}`,
      ttl: Math.max(delayMs, 1),
      extend: true,
      replace: true,
      keepLastIfActive: true,
    },
    attempts: 20,
    backoff: { type: 'fixed', delay: 2_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

const metaEventsWorker = new Worker(
  QUEUES.metaEvents,
  async (job) => {
    const { eventId } = metaEventJobSchema.parse(job.data);
    await processMetaEvent(eventId, {
      db,
      logger,
      allowlist,
      isProduction,
      enqueueRespond: (respondJob) => enqueueRespond(respondJob),
    });
  },
  { connection, concurrency: 10 },
);

const respondWorker = new Worker(
  RESPOND_QUEUE,
  async (job) => {
    const outcome = await processRespond(respondJobSchema.parse(job.data), {
      db,
      logger,
      llm,
      model: env.AI_MODEL_CHAT,
      reasoningEffort: env.AI_REASONING_EFFORT,
      masterKey,
      createClient: whatsapp,
      allowlist,
      isProduction,
      lock: createRedisLock(connection),
      enqueueRespond,
    });
    if (outcome !== 'replied') logger.info({ leadId: job.data.leadId, outcome }, 'Respond run');
  },
  { connection, concurrency: 20 },
);

const contactWorker = new Worker(
  CONTACT_QUEUE,
  async (job) => {
    const outcome = await processContact(contactJobSchema.parse(job.data), {
      db,
      logger,
      masterKey,
      createClient: whatsapp,
      allowlist,
      isProduction,
      lock: createRedisLock(connection),
    });
    logger.info({ leadId: job.data.leadId, outcome }, 'Contact run');
  },
  { connection, concurrency: 10 },
);

for (const [name, worker] of [
  ['meta-events', metaEventsWorker],
  ['respond', respondWorker],
  ['contact', contactWorker],
] as const) {
  worker.on('failed', (job, error) => {
    if (error instanceof LeadBusyError || error instanceof ContactBusyError) return; // retried shortly
    logger.error(
      { queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: error },
      'Job failed',
    );
  });
}

logger.info({ queues: [QUEUES.metaEvents, RESPOND_QUEUE, CONTACT_QUEUE] }, 'Worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down`);
  await Promise.all([metaEventsWorker.close(), respondWorker.close(), contactWorker.close()]);
  await respondQueue.close();
  await pool.end();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

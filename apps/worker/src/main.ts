import './load-env.ts';
import { createDb } from '@qualify/db';
import {
  ALLOW_ALL,
  createLlmClient,
  createMailer,
  parseAllowlist,
  parseMasterKey,
  resolveMailSettings,
  WhatsAppClient,
} from '@qualify/integrations';
import {
  CONTACT_QUEUE,
  type ContactJob,
  contactJobSchema,
  FOLLOW_UP_QUEUE,
  type FollowUpJob,
  followUpJobSchema,
  LEAD_EVENTS_QUEUE,
  type LeadEventJob,
  leadEventJobSchema,
  metaEventJobSchema,
  QUEUES,
  REPORT_SEND_QUEUE,
  REPORT_TICK_QUEUE,
  reportSendJobId,
  type ReportSendJob,
  reportSendJobSchema,
  RESCORE_QUEUE,
  rescoreJobSchema,
  RESPOND_QUEUE,
  type RespondJob,
  respondJobSchema,
  WEBHOOK_DELIVERY_QUEUE,
  type WebhookDeliveryJob,
  webhookDeliveryJobSchema,
} from '@qualify/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ContactBusyError, processContact } from './agent/contact.ts';
import {
  allFollowUpJobIds,
  FollowUpBusyError,
  type FollowUpScheduler,
  followUpJobId,
  processFollowUp,
} from './agent/follow-up.ts';
import { rescoreTenantLeads } from './agent/rescore.ts';
import { LeadBusyError, processRespond } from './agent/respond.ts';
import { loadWorkerEnv } from './env.ts';
import { createRedisLock } from './lock.ts';
import { createLogger } from './logger.ts';
import { processMetaEvent } from './meta-events/process-meta-event.ts';
import {
  processReportSend,
  processReportTick,
  REPORT_SEND_ATTEMPTS,
  REPORT_SEND_BACKOFF_MS,
  ReportRetryError,
} from './reports/reports.ts';
import {
  DELIVERY_ATTEMPTS,
  DELIVERY_BACKOFF_MS,
  DeliveryRetryError,
  type EmitLeadEvent,
  processLeadEvent,
  processWebhookDelivery,
} from './webhooks/webhooks.ts';

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
const mail = resolveMailSettings({
  production: isProduction,
  appName: env.APP_NAME,
  smtpUrl: env.SMTP_URL,
  mailFrom: env.MAIL_FROM,
});
const mailer = 'off' in mail ? null : createMailer({ url: mail.url, from: mail.from });
if ('off' in mail) logger.warn(mail.off);
else logger.info({ smtp: new URL(mail.url).host }, 'Scheduled e-mail reports enabled');
if (!masterKey) logger.warn('ENCRYPTION_MASTER_KEY not set: messages are stored but not answered');
logger.info(
  llm ? { model: env.AI_MODEL_CHAT, reasoningEffort: env.AI_REASONING_EFFORT } : { model: null },
  llm ? 'AI agent enabled' : 'AI agent disabled: OPENAI_API_KEY not set',
);

const respondQueue = new Queue<RespondJob>(RESPOND_QUEUE, { connection });
const followUpQueue = new Queue<FollowUpJob>(FOLLOW_UP_QUEUE, { connection });
const contactQueue = new Queue<ContactJob>(CONTACT_QUEUE, { connection });
const leadEventsQueue = new Queue<LeadEventJob>(LEAD_EVENTS_QUEUE, { connection });
const deliveryQueue = new Queue<WebhookDeliveryJob>(WEBHOOK_DELIVERY_QUEUE, { connection });
const reportSendQueue = new Queue<ReportSendJob>(REPORT_SEND_QUEUE, { connection });
const reportTickQueue = new Queue(REPORT_TICK_QUEUE, { connection });

/** One job per report run; the id makes re-queuing a lost run a no-op while it still exists. */
async function enqueueReportSend(job: ReportSendJob): Promise<void> {
  await reportSendQueue.add('send', job, {
    jobId: reportSendJobId(job.runId),
    attempts: REPORT_SEND_ATTEMPTS,
    backoff: { type: 'exponential', delay: REPORT_SEND_BACKOFF_MS },
    removeOnComplete: true,
    removeOnFail: true,
  });
}

// The schedule lives in Postgres; this tick only asks "what is due?" every minute.
await reportTickQueue.upsertJobScheduler(
  'report-tick',
  { every: 60_000 },
  { name: 'tick', opts: { removeOnComplete: 50, removeOnFail: 50 } },
);

/** What happened to a lead, for webhooks (fanned out by the lead-events worker). */
const emitLeadEvent: EmitLeadEvent = async (event) => {
  await leadEventsQueue.add(
    'event',
    { ...event, at: new Date().toISOString() },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  );
};

async function enqueueDelivery(job: WebhookDeliveryJob): Promise<void> {
  await deliveryQueue.add('deliver', job, {
    attempts: DELIVERY_ATTEMPTS,
    backoff: { type: 'exponential', delay: DELIVERY_BACKOFF_MS },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

/** Opening message for a lead from a Meta lead form (same job the api queues for API leads). */
async function enqueueContact(job: ContactJob): Promise<void> {
  await contactQueue.add('contact', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
}

/** One delayed job per follow-up step; completed jobs are removed so ids can be reused. */
const followUps: FollowUpScheduler = {
  async schedule(job, dueAt) {
    const jobId = followUpJobId(job.leadId, job.kind, job.step);
    await followUpQueue.remove(jobId).catch(() => 0);
    await followUpQueue.add(job.kind, job, {
      jobId,
      delay: Math.max(0, dueAt.getTime() - Date.now()),
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  },
  async cancel(leadId) {
    await Promise.all(
      allFollowUpJobIds(leadId).map((jobId) => followUpQueue.remove(jobId).catch(() => 0)),
    );
  },
};

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
      followUps,
      emitLeadEvent,
      leadForms: {
        masterKey,
        createClient: whatsapp,
        llm,
        model: env.AI_MODEL_CHAT,
        reasoningEffort: env.AI_REASONING_EFFORT,
        enqueueContact,
      },
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
      followUps,
      emitLeadEvent,
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
      followUps,
    });
    logger.info({ leadId: job.data.leadId, outcome }, 'Contact run');
  },
  { connection, concurrency: 10 },
);

const followUpWorker = new Worker(
  FOLLOW_UP_QUEUE,
  async (job) => {
    const outcome = await processFollowUp(followUpJobSchema.parse(job.data), {
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
      scheduler: followUps,
      emitLeadEvent,
    });
    logger.info({ leadId: job.data.leadId, kind: job.data.kind, outcome }, 'Follow-up run');
  },
  { connection, concurrency: 10 },
);

const rescoreWorker = new Worker(
  RESCORE_QUEUE,
  async (job) => {
    const { tenantId } = rescoreJobSchema.parse(job.data);
    const result = await rescoreTenantLeads(db, tenantId);
    logger.info({ tenantId, ...result }, 'Leads rescored');
  },
  { connection, concurrency: 2 },
);

const leadEventsWorker = new Worker(
  LEAD_EVENTS_QUEUE,
  async (job) => {
    const event = leadEventJobSchema.parse(job.data);
    const outcome = await processLeadEvent(event, {
      db,
      logger,
      appBaseUrl: env.APP_BASE_URL,
      enqueueDelivery,
    });
    if (typeof outcome === 'number') {
      logger.info({ ...event, deliveries: outcome }, 'Lead event sent to webhooks');
    }
  },
  { connection, concurrency: 10 },
);

const deliveryWorker = new Worker(
  WEBHOOK_DELIVERY_QUEUE,
  async (job) => {
    const outcome = await processWebhookDelivery(
      webhookDeliveryJobSchema.parse(job.data),
      { attemptsMade: job.attemptsMade, maxAttempts: job.opts.attempts ?? 1 },
      {
        db,
        logger,
        masterKey,
        // Development may post to a local receiver; production only to public https URLs.
        policy: { allowPrivate: !isProduction, requireHttps: isProduction },
      },
    );
    logger.info({ deliveryId: job.data.deliveryId, outcome }, 'Webhook delivery');
  },
  { connection, concurrency: 10 },
);

const reportTickWorker = new Worker(
  REPORT_TICK_QUEUE,
  async () => {
    const { queued } = await processReportTick({ db, logger, enqueueSend: enqueueReportSend });
    if (queued) logger.info({ queued }, 'Report runs queued');
  },
  { connection, concurrency: 1 },
);

const reportSendWorker = new Worker(
  REPORT_SEND_QUEUE,
  async (job) => {
    const outcome = await processReportSend(
      reportSendJobSchema.parse(job.data),
      { attemptsMade: job.attemptsMade, maxAttempts: job.opts.attempts ?? 1 },
      { db, logger, mailer, appBaseUrl: env.APP_BASE_URL, productName: env.APP_NAME },
    );
    logger.info({ runId: job.data.runId, outcome }, 'Report run');
  },
  { connection, concurrency: 2 },
);

for (const [name, worker] of [
  ['meta-events', metaEventsWorker],
  ['respond', respondWorker],
  ['contact', contactWorker],
  ['follow-up', followUpWorker],
  ['rescore', rescoreWorker],
  ['lead-events', leadEventsWorker],
  ['webhook-delivery', deliveryWorker],
  ['report-tick', reportTickWorker],
  ['report-send', reportSendWorker],
] as const) {
  worker.on('failed', (job, error) => {
    const busy =
      error instanceof LeadBusyError ||
      error instanceof ContactBusyError ||
      error instanceof FollowUpBusyError;
    if (busy) return; // retried shortly
    if (error instanceof ReportRetryError) {
      logger.warn({ jobId: job?.id, attempts: job?.attemptsMade, err: error }, 'Report retry');
      return;
    }
    if (error instanceof DeliveryRetryError) {
      logger.warn({ jobId: job?.id, attempts: job?.attemptsMade, err: error }, 'Webhook retry');
      return;
    }
    logger.error(
      { queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: error },
      'Job failed',
    );
  });
}

logger.info(
  {
    queues: [
      QUEUES.metaEvents,
      RESPOND_QUEUE,
      CONTACT_QUEUE,
      FOLLOW_UP_QUEUE,
      RESCORE_QUEUE,
      LEAD_EVENTS_QUEUE,
      WEBHOOK_DELIVERY_QUEUE,
      REPORT_TICK_QUEUE,
      REPORT_SEND_QUEUE,
    ],
  },
  'Worker started',
);

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down`);
  await Promise.all([
    metaEventsWorker.close(),
    respondWorker.close(),
    contactWorker.close(),
    followUpWorker.close(),
    rescoreWorker.close(),
    leadEventsWorker.close(),
    deliveryWorker.close(),
    reportTickWorker.close(),
    reportSendWorker.close(),
  ]);
  await Promise.all([
    respondQueue.close(),
    followUpQueue.close(),
    contactQueue.close(),
    leadEventsQueue.close(),
    deliveryQueue.close(),
    reportSendQueue.close(),
    reportTickQueue.close(),
  ]);
  await pool.end();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

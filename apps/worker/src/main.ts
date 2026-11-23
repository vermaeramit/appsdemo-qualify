import './load-env.ts';
import { createDb, expireInboundMedia, pruneActivity, stalePendingInboundMedia } from '@qualify/db';
import { createWorkerAi } from './ai.ts';
import { createMailSource } from './mail.ts';
import { ALLOW_ALL, parseAllowlist, parseMasterKey, WhatsAppClient } from '@qualify/integrations';
import {
  ACTIVITY_PRUNE_QUEUE,
  ACTIVITY_RETENTION_DAYS,
  CONTACT_QUEUE,
  type ContactJob,
  contactJobSchema,
  FOLLOW_UP_QUEUE,
  type FollowUpJob,
  INBOUND_MEDIA_RETENTION_DAYS,
  followUpJobSchema,
  LEAD_EVENTS_QUEUE,
  type LeadEventJob,
  leadEventJobSchema,
  MEDIA_DOWNLOAD_QUEUE,
  MEDIA_PRUNE_QUEUE,
  type MediaDownloadJob,
  mediaDownloadJobSchema,
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
import { z } from 'zod';
import { createActivityRecorder } from './activity.ts';
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
import {
  MEDIA_DOWNLOAD_ATTEMPTS,
  MEDIA_DOWNLOAD_BACKOFF_MS,
  processMediaDownload,
} from './media/download.ts';
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
/** Activity log (D-091): what happened to each lead, shown in the dashboard. */
const activity = createActivityRecorder(db, logger);

const allowlist = parseAllowlist(env.DEV_ALLOWED_NUMBERS);
const isProduction = env.NODE_ENV === 'production';
const masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;
/** Each workspace's AI: its own OpenAI key, AppsDemo's (OPENAI_API_KEY), or off (D-094). */
const ai = createWorkerAi({
  db,
  logger,
  platformKey: env.OPENAI_API_KEY ?? null,
  masterKey,
  defaultModel: env.AI_MODEL_CHAT,
  reasoningEffort: env.AI_REASONING_EFFORT,
});
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
/** Scheduled reports: the admin's SMTP server, else SMTP_URL, else Mailpit in development (D-095). */
const mailer = createMailSource({
  db,
  logger,
  masterKey,
  production: isProduction,
  appName: env.APP_NAME,
  smtpUrl: env.SMTP_URL,
  mailFrom: env.MAIL_FROM,
});
if (!masterKey) logger.warn('ENCRYPTION_MASTER_KEY not set: messages are stored but not answered');
logger.info(
  { defaultModel: env.AI_MODEL_CHAT, reasoningEffort: env.AI_REASONING_EFFORT },
  env.OPENAI_API_KEY
    ? "AI per workspace: own keys, or AppsDemo's key where switched on"
    : "AI per workspace: own keys only (OPENAI_API_KEY not set, so AppsDemo's key is unavailable)",
);

const respondQueue = new Queue<RespondJob>(RESPOND_QUEUE, { connection });
const followUpQueue = new Queue<FollowUpJob>(FOLLOW_UP_QUEUE, { connection });
const contactQueue = new Queue<ContactJob>(CONTACT_QUEUE, { connection });
const leadEventsQueue = new Queue<LeadEventJob>(LEAD_EVENTS_QUEUE, { connection });
const deliveryQueue = new Queue<WebhookDeliveryJob>(WEBHOOK_DELIVERY_QUEUE, { connection });
const reportSendQueue = new Queue<ReportSendJob>(REPORT_SEND_QUEUE, { connection });
const reportTickQueue = new Queue(REPORT_TICK_QUEUE, { connection });
const activityPruneQueue = new Queue(ACTIVITY_PRUNE_QUEUE, { connection });
const mediaDownloadQueue = new Queue<MediaDownloadJob>(MEDIA_DOWNLOAD_QUEUE, { connection });
const mediaPruneQueue = new Queue(MEDIA_PRUNE_QUEUE, { connection });

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

// Old activity entries are deleted every 6 hours (kept ACTIVITY_RETENTION_DAYS days).
await activityPruneQueue.upsertJobScheduler(
  'activity-prune',
  { every: 6 * 3_600_000 },
  { name: 'prune', opts: { removeOnComplete: 20, removeOnFail: 20 } },
);

// Every 6 hours (D-100): files older than INBOUND_MEDIA_RETENTION_DAYS are emptied, and downloads
// whose job was lost are queued again.
await mediaPruneQueue.upsertJobScheduler(
  'media-prune',
  { every: 6 * 3_600_000 },
  { name: 'prune', opts: { removeOnComplete: 20, removeOnFail: 20 } },
);

/** One download per received file; the job id makes a repeated webhook a no-op. */
async function enqueueMediaDownload(job: MediaDownloadJob): Promise<void> {
  await mediaDownloadQueue.add('download', job, {
    jobId: `media:${job.messageId}`,
    attempts: MEDIA_DOWNLOAD_ATTEMPTS,
    backoff: { type: 'exponential', delay: MEDIA_DOWNLOAD_BACKOFF_MS },
    removeOnComplete: true,
    // Removed either way, so the prune job can queue a lost or crashed download again by its id.
    removeOnFail: true,
  });
}

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
      enqueueMediaDownload,
      followUps,
      emitLeadEvent,
      activity,
      leadForms: {
        masterKey,
        createClient: whatsapp,
        ai,
        enqueueContact,
        activity,
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
      ai,
      masterKey,
      createClient: whatsapp,
      allowlist,
      isProduction,
      lock: createRedisLock(connection),
      enqueueRespond,
      followUps,
      emitLeadEvent,
      activity,
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
      activity,
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
      ai,
      masterKey,
      createClient: whatsapp,
      allowlist,
      isProduction,
      lock: createRedisLock(connection),
      scheduler: followUps,
      emitLeadEvent,
      activity,
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
        activity,
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

const activityPruneWorker = new Worker(
  ACTIVITY_PRUNE_QUEUE,
  async () => {
    const removed = await pruneActivity(db, ACTIVITY_RETENTION_DAYS);
    if (removed) logger.info({ removed }, 'Old activity entries deleted');
  },
  { connection, concurrency: 1 },
);

const mediaDownloadWorker = new Worker(
  MEDIA_DOWNLOAD_QUEUE,
  async (job) => {
    const attempts = job.opts.attempts ?? 1;
    const outcome = await processMediaDownload(
      mediaDownloadJobSchema.parse(job.data),
      { isLastAttempt: job.attemptsMade + 1 >= attempts },
      { db, logger, masterKey, createClient: whatsapp, activity },
    );
    if (outcome !== 'stored')
      logger.info({ messageId: job.data.messageId, outcome }, 'Media download');
  },
  { connection, concurrency: 5 },
);

const mediaPruneWorker = new Worker(
  MEDIA_PRUNE_QUEUE,
  async () => {
    const expired = await expireInboundMedia(db, INBOUND_MEDIA_RETENTION_DAYS);
    if (expired) logger.info({ expired }, 'Old received files removed');
    // Meta keeps a received file 30 days; a download still pending after 10 minutes was lost.
    const stale = await stalePendingInboundMedia(db, { olderThanMinutes: 10, withinDays: 29 });
    for (const job of stale) await enqueueMediaDownload(job);
    if (stale.length) logger.warn({ requeued: stale.length }, 'Lost file downloads queued again');
  },
  { connection, concurrency: 1 },
);

/** Jobs about one lead whose crash the team should see in the lead's activity. */
const LEAD_JOB_FAILURES: Record<string, string> = {
  respond: 'AI reply failed',
  contact: 'Opening failed',
  'follow-up': 'Follow-up failed',
};
const leadJobSchema = z.object({ tenantId: z.string().min(1), leadId: z.uuid() });

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
  ['activity-prune', activityPruneWorker],
  ['media-download', mediaDownloadWorker],
  ['media-prune', mediaPruneWorker],
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
    // The first failure and the last one go to the lead's activity (retries in between don't).
    const label = LEAD_JOB_FAILURES[name];
    const lead = leadJobSchema.safeParse(job?.data);
    const attempts = job?.opts.attempts ?? 1;
    const made = job?.attemptsMade ?? 0;
    if (label && lead.success && (made === 1 || made >= attempts)) {
      void activity({
        tenantId: lead.data.tenantId,
        leadId: lead.data.leadId,
        source: name === 'respond' ? 'agent' : 'outreach',
        kind: `${name === 'respond' ? 'agent' : 'outreach'}.job_failed`,
        level: 'error',
        message:
          made >= attempts
            ? `${label}, gave up after ${made} attempts: ${error.message}`
            : `${label} (attempt 1 of ${attempts}), retrying: ${error.message}`,
      });
    }
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
      ACTIVITY_PRUNE_QUEUE,
      MEDIA_DOWNLOAD_QUEUE,
      MEDIA_PRUNE_QUEUE,
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
    activityPruneWorker.close(),
    mediaDownloadWorker.close(),
    mediaPruneWorker.close(),
  ]);
  await Promise.all([
    respondQueue.close(),
    followUpQueue.close(),
    contactQueue.close(),
    leadEventsQueue.close(),
    deliveryQueue.close(),
    reportSendQueue.close(),
    reportTickQueue.close(),
    activityPruneQueue.close(),
    mediaDownloadQueue.close(),
    mediaPruneQueue.close(),
  ]);
  await pool.end();
  connection.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

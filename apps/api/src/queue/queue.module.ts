import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  CONTACT_QUEUE,
  LEAD_EVENTS_QUEUE,
  QUEUES,
  REPORT_SEND_QUEUE,
  RESCORE_QUEUE,
  WEBHOOK_DELIVERY_QUEUE,
} from '@qualify/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { ENV } from '../tokens';

export const REDIS = Symbol('REDIS');
export const META_EVENTS_QUEUE = Symbol('META_EVENTS_QUEUE');
export const CONTACT_QUEUE_TOKEN = Symbol('CONTACT_QUEUE');
export const RESCORE_QUEUE_TOKEN = Symbol('RESCORE_QUEUE');
export const LEAD_EVENTS_QUEUE_TOKEN = Symbol('LEAD_EVENTS_QUEUE');
export const WEBHOOK_DELIVERY_QUEUE_TOKEN = Symbol('WEBHOOK_DELIVERY_QUEUE');
export const REPORT_SEND_QUEUE_TOKEN = Symbol('REPORT_SEND_QUEUE');

const QUEUE_NAMES = [
  [META_EVENTS_QUEUE, QUEUES.metaEvents],
  [CONTACT_QUEUE_TOKEN, CONTACT_QUEUE],
  [RESCORE_QUEUE_TOKEN, RESCORE_QUEUE],
  [LEAD_EVENTS_QUEUE_TOKEN, LEAD_EVENTS_QUEUE],
  [WEBHOOK_DELIVERY_QUEUE_TOKEN, WEBHOOK_DELIVERY_QUEUE],
  [REPORT_SEND_QUEUE_TOKEN, REPORT_SEND_QUEUE],
] as const;

/** BullMQ producers. The worker process consumes these queues. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      // maxRetriesPerRequest: null is required by BullMQ for blocking connections.
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    ...QUEUE_NAMES.map(([token, name]) => ({
      provide: token,
      inject: [REDIS],
      useFactory: (connection: Redis) => new Queue(name, { connection }),
    })),
  ],
  exports: [REDIS, ...QUEUE_NAMES.map(([token]) => token)],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(
    @Inject(META_EVENTS_QUEUE) private readonly metaEvents: Queue,
    @Inject(CONTACT_QUEUE_TOKEN) private readonly contact: Queue,
    @Inject(RESCORE_QUEUE_TOKEN) private readonly rescore: Queue,
    @Inject(LEAD_EVENTS_QUEUE_TOKEN) private readonly leadEvents: Queue,
    @Inject(WEBHOOK_DELIVERY_QUEUE_TOKEN) private readonly deliveries: Queue,
    @Inject(REPORT_SEND_QUEUE_TOKEN) private readonly reports: Queue,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [
        this.metaEvents,
        this.contact,
        this.rescore,
        this.leadEvents,
        this.deliveries,
        this.reports,
      ].map((queue) => queue.close()),
    );
    this.redis.disconnect();
  }
}

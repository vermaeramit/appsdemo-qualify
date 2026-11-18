import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { CONTACT_QUEUE, QUEUES, RESCORE_QUEUE } from '@qualify/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { ENV } from '../tokens';

export const REDIS = Symbol('REDIS');
export const META_EVENTS_QUEUE = Symbol('META_EVENTS_QUEUE');
export const CONTACT_QUEUE_TOKEN = Symbol('CONTACT_QUEUE');
export const RESCORE_QUEUE_TOKEN = Symbol('RESCORE_QUEUE');

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
    {
      provide: META_EVENTS_QUEUE,
      inject: [REDIS],
      useFactory: (connection: Redis) => new Queue(QUEUES.metaEvents, { connection }),
    },
    {
      provide: CONTACT_QUEUE_TOKEN,
      inject: [REDIS],
      useFactory: (connection: Redis) => new Queue(CONTACT_QUEUE, { connection }),
    },
    {
      provide: RESCORE_QUEUE_TOKEN,
      inject: [REDIS],
      useFactory: (connection: Redis) => new Queue(RESCORE_QUEUE, { connection }),
    },
  ],
  exports: [META_EVENTS_QUEUE, CONTACT_QUEUE_TOKEN, RESCORE_QUEUE_TOKEN],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(
    @Inject(META_EVENTS_QUEUE) private readonly metaEvents: Queue,
    @Inject(CONTACT_QUEUE_TOKEN) private readonly contact: Queue,
    @Inject(RESCORE_QUEUE_TOKEN) private readonly rescore: Queue,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.metaEvents.close(), this.contact.close(), this.rescore.close()]);
    this.redis.disconnect();
  }
}

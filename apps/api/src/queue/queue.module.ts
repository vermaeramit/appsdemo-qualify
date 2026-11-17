import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { QUEUES } from '@qualify/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { ENV } from '../tokens';

export const REDIS = Symbol('REDIS');
export const META_EVENTS_QUEUE = Symbol('META_EVENTS_QUEUE');

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
  ],
  exports: [META_EVENTS_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(
    @Inject(META_EVENTS_QUEUE) private readonly metaEvents: Queue,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.metaEvents.close();
    this.redis.disconnect();
  }
}

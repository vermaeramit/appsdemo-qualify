import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  type RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { type DbHandle, inboundMetaEvents } from '@qualify/db';
import { verifyMetaSignature } from '@qualify/integrations';
import type { MetaEventJob } from '@qualify/shared';
import type { Queue } from 'bullmq';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../config/env';
import { META_EVENTS_QUEUE } from '../queue/queue.module';
import { SkipOriginCheck } from '../security/skip-origin-check.decorator';
import { DB, ENV } from '../tokens';

/**
 * Meta (WhatsApp) webhooks: GET = subscription handshake, POST = events.
 * POST does the minimum (verify, persist, enqueue) and answers 200 fast; the worker does the rest.
 */
@Controller('webhooks/meta')
@SkipOriginCheck() // Meta authenticates with an HMAC signature, not cookies.
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(META_EVENTS_QUEUE) private readonly queue: Queue<MetaEventJob>,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    if (!this.env.META_WEBHOOK_VERIFY_TOKEN) {
      throw new ServiceUnavailableException('Meta webhook is not configured');
    }
    if (mode !== 'subscribe' || token !== this.env.META_WEBHOOK_VERIFY_TOKEN || !challenge) {
      throw new ForbiddenException('Webhook verification failed');
    }
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() request: RawBodyRequest<FastifyRequest>): Promise<string> {
    if (!this.env.META_APP_SECRET) {
      throw new ServiceUnavailableException('Meta webhook is not configured');
    }
    const signature = request.headers['x-hub-signature-256'];
    const rawBody = request.rawBody;
    if (
      !rawBody ||
      typeof signature !== 'string' ||
      !verifyMetaSignature(rawBody, signature, this.env.META_APP_SECRET)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = request.body as Record<string, unknown>;
    const [event] = await this.handle.db
      .insert(inboundMetaEvents)
      .values({ object: typeof payload.object === 'string' ? payload.object : null, payload })
      .returning({ id: inboundMetaEvents.id });

    try {
      // jobId = eventId, so a duplicate enqueue of the same event is ignored by BullMQ.
      await this.queue.add(
        'meta-event',
        { eventId: event!.id },
        {
          jobId: event!.id,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      );
    } catch (error) {
      // The event is stored (processed_at IS NULL) and can be re-enqueued; still ack Meta.
      this.logger.error({ err: error, eventId: event!.id }, 'Failed to enqueue Meta event');
    }
    return 'EVENT_RECEIVED';
  }
}

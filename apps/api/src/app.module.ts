import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from './config/env';
import { ConversationsController } from './conversations/conversations.controller';
import { CoreModule } from './core/core.module';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { QueueModule } from './queue/queue.module';
import { OriginGuard } from './security/origin.guard';
import { ENV } from './tokens';
import { LeadsV1Controller } from './v1/leads-v1.controller';
import { PlaybookV1Controller } from './v1/playbook-v1.controller';
import { MetaWebhookController } from './webhooks/meta-webhook.controller';

@Module({
  imports: [
    CoreModule,
    QueueModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // Never log credentials.
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-api-key"]',
            'req.headers["x-hub-signature-256"]',
            'req.query["hub.verify_token"]',
            'res.headers["set-cookie"]',
          ],
          serializers: {
            // The query is logged separately (redacted above); keep it out of the URL.
            req: (req: { url?: string }) => {
              req.url = req.url?.split('?')[0];
              return req;
            },
          },
          autoLogging: { ignore: (req) => req.url === '/api/health' },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
        },
      }),
    }),
  ],
  controllers: [
    HealthController,
    MeController,
    ConversationsController,
    MetaWebhookController,
    LeadsV1Controller,
    PlaybookV1Controller,
  ],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}

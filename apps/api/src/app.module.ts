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
            'req.headers["x-hub-signature-256"]',
            'res.headers["set-cookie"]',
          ],
          autoLogging: { ignore: (req) => req.url === '/api/health' },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
        },
      }),
    }),
  ],
  controllers: [HealthController, MeController, ConversationsController, MetaWebhookController],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
})
export class AppModule {}

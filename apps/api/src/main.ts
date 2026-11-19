import './load-dotenv';
import 'reflect-metadata';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { MEDIA_MIMES } from '@qualify/shared';
import { AppModule } from './app.module';
import type { Auth } from './auth/auth';
import { registerAuthRoute } from './auth/auth-route';
import type { Env } from './config/env';
import { AUTH, ENV } from './tokens';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 }),
    // rawBody: Meta webhook signatures are computed over the exact bytes received.
    { bufferLogs: true, rawBody: true },
  );
  app.useLogger(app.get(Logger));

  const env = app.get<Env>(ENV);
  const auth = app.get<Auth>(AUTH);

  await app.register(helmet);
  await app.register(rateLimit, {
    // Per client IP (trustProxy). Locally the e2e suite drives every page from one IP, so the
    // limit is only enforced as-is in production.
    max: env.NODE_ENV === 'production' ? 300 : 3_000,
    timeWindow: '1 minute',
    // Meta delivers webhooks in bursts from shared IPs; they are authenticated by signature.
    allowList: (request) => request.url.startsWith('/api/webhooks/'),
  });

  registerAuthRoute(app.getHttpAdapter().getInstance(), auth, env.APP_BASE_URL);
  // Template header files (POST /api/media) arrive as raw bytes, up to 16 MB (D-084).
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      MEDIA_MIMES,
      { parseAs: 'buffer', bodyLimit: 16 * 1024 * 1024 },
      (_request, body, done) => done(null, body),
    );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
}

void bootstrap();

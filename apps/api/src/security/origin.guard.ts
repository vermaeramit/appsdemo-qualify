import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../config/env';
import { ENV } from '../tokens';
import { isAllowedOrigin } from './origin-check';

/** Global CSRF guard for Nest routes (Better Auth checks its own routes via trustedOrigins). */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const allowed = isAllowedOrigin(
      request.method,
      { origin: request.headers.origin, referer: request.headers.referer },
      this.env.APP_BASE_URL,
    );
    if (!allowed) throw new ForbiddenException('Cross-origin request blocked');
    return true;
  }
}

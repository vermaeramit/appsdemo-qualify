import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import type { Auth, AuthSession } from './auth';
import { AUTH } from '../tokens';

type RequestWithSession = FastifyRequest & { authSession?: AuthSession };

/** Requires a valid Better Auth session cookie. Attaches the session to the request. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();
    request.authSession = session;
    return true;
  }
}

/** The session attached by SessionGuard. Only use on routes guarded by it. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession => {
    const session = context.switchToHttp().getRequest<RequestWithSession>().authSession;
    if (!session) throw new UnauthorizedException();
    return session;
  },
);

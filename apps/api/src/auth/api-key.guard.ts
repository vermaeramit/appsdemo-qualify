import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  apiKeys,
  type DbHandle,
  eq,
  hashApiKey,
  resolveTenantByApiKey,
  withTenant,
} from '@qualify/db';
import type { FastifyRequest } from 'fastify';
import { DB } from '../tokens';
import type { WorkspaceContext } from './workspace.guard';

type RequestWithWorkspace = FastifyRequest & { workspace?: WorkspaceContext };

function extractKey(request: FastifyRequest): string | null {
  const header = request.headers['x-api-key'];
  if (typeof header === 'string' && header.length > 0) return header.trim();
  const authorization = request.headers.authorization;
  if (authorization?.startsWith('Bearer ')) return authorization.slice('Bearer '.length).trim();
  return null;
}

/**
 * Server-to-server auth with a workspace API key (`Authorization: Bearer qk_live_…` or
 * `X-API-Key`). Sets the same WorkspaceContext as the session guard, so controllers can use
 * @CurrentWorkspace() either way. Combine with @SkipOriginCheck (no browser, no cookies).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithWorkspace>();
    const key = extractKey(request);
    if (!key) throw new UnauthorizedException('Missing API key');

    const tenantId = await resolveTenantByApiKey(this.handle.db, key);
    if (!tenantId) throw new UnauthorizedException('Invalid or revoked API key');

    await withTenant(this.handle.db, tenantId, (tx) =>
      tx
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.keyHash, hashApiKey(key))),
    );
    request.workspace = { tenantId, userId: 'api-key', role: 'admin' };
    return true;
  }
}

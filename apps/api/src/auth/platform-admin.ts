import { ForbiddenException } from '@nestjs/common';
import type { Env } from '../config/env';

/** Emails allowed to see every workspace (PLATFORM_ADMIN_EMAILS, comma-separated). */
export function platformAdmins(env: Env): Set<string> {
  return new Set(
    (env.PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(env: Env, email: string): boolean {
  return platformAdmins(env).has(email.toLowerCase());
}

export function requirePlatformAdmin(env: Env, email: string): void {
  if (!isPlatformAdmin(env, email)) {
    throw new ForbiddenException('Only platform admins can see this page');
  }
}

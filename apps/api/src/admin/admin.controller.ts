import { ForbiddenException, Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { count, type DbHandle, member, organization, sql, withTenant } from '@qualify/db';
import {
  type AdminOverview,
  adminOverviewSchema,
  CONTACT_QUEUE,
  FOLLOW_UP_QUEUE,
  LEAD_EVENTS_QUEUE,
  QUEUES,
  RESCORE_QUEUE,
  RESPOND_QUEUE,
  WEBHOOK_DELIVERY_QUEUE,
} from '@qualify/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { AuthSession } from '../auth/auth';
import { CurrentSession, SessionGuard } from '../auth/session.guard';
import type { Env } from '../config/env';
import { REDIS } from '../queue/queue.module';
import { DB, ENV } from '../tokens';

const QUEUE_NAMES = [
  QUEUES.metaEvents,
  RESPOND_QUEUE,
  CONTACT_QUEUE,
  FOLLOW_UP_QUEUE,
  RESCORE_QUEUE,
  LEAD_EVENTS_QUEUE,
  WEBHOOK_DELIVERY_QUEUE,
];

type Stats = {
  leads_total: number;
  leads_30d: number;
  qualified_30d: number;
  messages_30d: number;
  ai_replies_30d: number;
  last_message_at: string | null;
  phone: string | null;
  quality: string | null;
  webhooks: number;
};

/** Emails allowed to see every workspace (PLATFORM_ADMIN_EMAILS, comma-separated). */
export function platformAdmins(env: Env): Set<string> {
  return new Set(
    (env.PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Platform operator view (M7): every workspace's usage and number, plus queue health. Each
 * workspace is read inside its own tenant scope, so RLS still applies.
 */
@Controller('admin')
@UseGuards(SessionGuard)
export class AdminController {
  private readonly queues: Queue[];

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) redis: Redis,
  ) {
    this.queues = QUEUE_NAMES.map((name) => new Queue(name, { connection: redis }));
  }

  @Get('overview')
  async overview(@CurrentSession() current: AuthSession): Promise<AdminOverview> {
    if (!platformAdmins(this.env).has(current.user.email.toLowerCase())) {
      throw new ForbiddenException('Only platform admins can see this page');
    }
    const { db } = this.handle;
    const orgs = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .orderBy(organization.createdAt);
    const members = await db
      .select({ organizationId: member.organizationId, total: count() })
      .from(member)
      .groupBy(member.organizationId);
    const memberCount = new Map(members.map((row) => [row.organizationId, row.total]));

    const workspaces = [];
    for (const org of orgs) {
      const [stats] = (
        await withTenant(db, org.id, (tx) =>
          tx.execute<Stats>(sql`
            select
              (select count(*)::int from leads) as leads_total,
              (select count(*)::int from leads where created_at >= now() - interval '30 days') as leads_30d,
              (select count(*)::int from leads where qualified_at >= now() - interval '30 days') as qualified_30d,
              (select count(*)::int from messages where created_at >= now() - interval '30 days') as messages_30d,
              (select count(*)::int from messages
                where sender = 'ai' and created_at >= now() - interval '30 days') as ai_replies_30d,
              (select max(created_at)::text from messages) as last_message_at,
              (select display_phone from phone_numbers where status = 'active' limit 1) as phone,
              (select quality_rating from phone_numbers where status = 'active' limit 1) as quality,
              (select count(*)::int from webhook_endpoints where active) as webhooks`),
        )
      ).rows;
      workspaces.push({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
        members: memberCount.get(org.id) ?? 0,
        leadsTotal: stats?.leads_total ?? 0,
        leads30d: stats?.leads_30d ?? 0,
        qualified30d: stats?.qualified_30d ?? 0,
        messages30d: stats?.messages_30d ?? 0,
        aiReplies30d: stats?.ai_replies_30d ?? 0,
        lastMessageAt: stats?.last_message_at
          ? new Date(stats.last_message_at).toISOString()
          : null,
        phone: stats?.phone ?? null,
        qualityRating: stats?.quality ?? null,
        webhooks: stats?.webhooks ?? 0,
      });
    }

    const queues = await Promise.all(
      this.queues.map(async (queue) => {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        return {
          name: queue.name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
        };
      }),
    );

    return adminOverviewSchema.parse({ workspaces, queues, checkedAt: new Date().toISOString() });
  }
}

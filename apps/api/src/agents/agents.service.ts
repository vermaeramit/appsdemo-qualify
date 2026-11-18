import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { findTemplate } from '@qualify/core';
import {
  auditLogs,
  createPublishedPlaybook,
  type DbHandle,
  eq,
  getDefaultPublishedPlaybook,
  getLatestPublishedVersion,
  playbooks,
  sql,
  type Transaction,
  withTenant,
} from '@qualify/db';
import {
  type AgentList,
  agentListSchema,
  type AgentSummary,
  type CreateAgent,
  type PlaybookRoute,
  type RouteOptions,
  routeOptionsSchema,
  type UpdateAgent,
} from '@qualify/shared';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { DB } from '../tokens';

const routeKey = (route: PlaybookRoute) =>
  `${route.type}:${route.type === 'campaign' ? route.value.trim().toLowerCase() : route.value.trim()}`;

const ROUTE_TYPE_WORDS: Record<PlaybookRoute['type'], string> = {
  form: 'form',
  ad: 'ad',
  campaign: 'campaign',
};

/**
 * Agents of a workspace (one playbook each) and the rules that route leads to them (D-086).
 * The default agent handles every lead that matches no rule.
 */
@Injectable()
export class AgentsService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  list(tenantId: string): Promise<AgentList> {
    return withTenant(this.handle.db, tenantId, (tx) => this.listIn(tx));
  }

  async create(workspace: WorkspaceContext, input: CreateAgent): Promise<AgentSummary> {
    return withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const base = await getDefaultPublishedPlaybook(tx);
      let config = base?.config;
      let templateKey: string | null = null;
      if (input.copyFrom) {
        const source = await getLatestPublishedVersion(tx, input.copyFrom);
        if (!source) throw new NotFoundException('The agent to copy was not found');
        config = source.config;
      } else if (input.template) {
        const template = findTemplate(input.template);
        config = template.build(base?.config.business.name ?? 'your business');
        templateKey = template.key;
      }
      if (!config) throw new BadRequestException('Create the default agent first');
      const created = await createPublishedPlaybook(tx, {
        tenantId: workspace.tenantId,
        name: input.name,
        templateKey,
        config,
        isDefault: false,
      });
      await this.audit(tx, workspace, 'agent.created', created!.playbookId, { name: input.name });
      const agents = await this.listIn(tx);
      return agents.agents.find((agent) => agent.id === created!.playbookId)!;
    });
  }

  async update(workspace: WorkspaceContext, id: string, input: UpdateAgent): Promise<AgentList> {
    return withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const all = await tx
        .select({
          id: playbooks.id,
          name: playbooks.name,
          isDefault: playbooks.isDefault,
          routes: playbooks.routes,
        })
        .from(playbooks);
      const agent = all.find((candidate) => candidate.id === id);
      if (!agent) throw new NotFoundException('Agent not found');

      if (input.routes) {
        const becomesDefault = input.isDefault ?? agent.isDefault;
        if (becomesDefault && input.routes.length) {
          throw new BadRequestException(
            'The default agent takes every lead no rule matches; it needs no rules.',
          );
        }
        const taken = new Map<string, string>();
        for (const other of all.filter((candidate) => candidate.id !== id)) {
          for (const route of other.routes) taken.set(routeKey(route), other.name);
        }
        for (const route of input.routes) {
          const owner = taken.get(routeKey(route));
          if (owner) {
            throw new ConflictException(
              `This ${ROUTE_TYPE_WORDS[route.type]} already goes to “${owner}”. Remove it there first.`,
            );
          }
        }
      }

      if (input.isDefault && !agent.isDefault) {
        // One default per workspace (partial unique index): unset the old one first.
        await tx.update(playbooks).set({ isDefault: false }).where(eq(playbooks.isDefault, true));
        await tx.update(playbooks).set({ isDefault: true, routes: [] }).where(eq(playbooks.id, id));
      }
      if (input.name !== undefined || input.routes !== undefined) {
        await tx
          .update(playbooks)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.routes !== undefined && !input.isDefault
              ? {
                  routes: input.routes.map((route) => ({
                    type: route.type,
                    value: route.value.trim(),
                    ...(route.label ? { label: route.label } : {}),
                  })),
                }
              : {}),
          })
          .where(eq(playbooks.id, id));
      }
      await this.audit(tx, workspace, 'agent.updated', id, { ...input });
      return this.listIn(tx);
    });
  }

  async remove(workspace: WorkspaceContext, id: string): Promise<void> {
    await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [agent] = await tx
        .select({ isDefault: playbooks.isDefault, name: playbooks.name })
        .from(playbooks)
        .where(eq(playbooks.id, id))
        .limit(1);
      if (!agent) throw new NotFoundException('Agent not found');
      if (agent.isDefault) {
        throw new ConflictException('Make another agent the default before deleting this one.');
      }
      // Its versions go too; leads it was handling continue with the agent their source routes
      // to (their pinned version is cleared).
      await tx.delete(playbooks).where(eq(playbooks.id, id));
      await this.audit(tx, workspace, 'agent.deleted', id, { name: agent.name });
    });
  }

  /** Forms, ads and campaigns seen recently, so rules can be picked instead of typed. */
  async routeOptions(tenantId: string): Promise<RouteOptions> {
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const forms = (
        await tx.execute<{ value: string; label: string | null }>(sql`
          select s.form_id as value, max(m.form_name) as label
          from lead_form_submissions s
          left join lead_form_mappings m on m.form_id = s.form_id
          group by s.form_id
          order by max(s.created_at) desc
          limit 50`)
      ).rows;
      const ads = (
        await tx.execute<{ value: string; label: string | null }>(sql`
          select value, max(label) as label from (
            select attribution->>'adId' as value,
                   coalesce(attribution->>'headline', attribution->>'formName') as label,
                   created_at
            from leads where attribution->>'adId' is not null
            union all
            select ad_id as value, null as label, created_at
            from lead_form_submissions where ad_id is not null
          ) seen
          group by value
          order by max(created_at) desc
          limit 50`)
      ).rows;
      const campaigns = (
        await tx.execute<{ value: string }>(sql`
          select attribution->>'campaign' as value
          from leads where attribution->>'campaign' is not null
          group by attribution->>'campaign'
          order by max(created_at) desc
          limit 50`)
      ).rows;
      return routeOptionsSchema.parse({
        forms: forms.map((form) => ({
          value: form.value,
          label: form.label ?? `Form ${form.value}`,
        })),
        ads: ads.map((ad) => ({ value: ad.value, label: ad.label ?? `Ad ${ad.value}` })),
        campaigns: campaigns.map((campaign) => ({ value: campaign.value, label: campaign.value })),
      });
    });
  }

  private async listIn(tx: Transaction): Promise<AgentList> {
    const rows = await tx
      .select({
        id: playbooks.id,
        name: playbooks.name,
        isDefault: playbooks.isDefault,
        templateKey: playbooks.templateKey,
        routes: playbooks.routes,
        createdAt: playbooks.createdAt,
      })
      .from(playbooks)
      .orderBy(playbooks.createdAt);
    // Leads per agent over the last 30 days (range scan on leads_tenant_created_idx).
    const recent = (
      await tx.execute<{ playbook_id: string; leads: number; hot: number }>(sql`
        select v.playbook_id, count(*)::int as leads,
               count(*) filter (where l.grade = 'hot')::int as hot
        from leads l
        join playbook_versions v on v.id = l.playbook_version_id
        where l.created_at >= now() - interval '30 days'
        group by v.playbook_id`)
    ).rows;
    const agents: AgentSummary[] = [];
    for (const row of rows) {
      const latest = await getLatestPublishedVersion(tx, row.id);
      const stats = recent.find((item) => item.playbook_id === row.id);
      agents.push({
        id: row.id,
        name: row.name,
        isDefault: row.isDefault,
        templateKey: row.templateKey,
        versionNo: latest?.versionNo ?? 0,
        questions: latest?.config.fields.length ?? 0,
        routes: row.routes,
        recentLeads: stats?.leads ?? 0,
        recentHot: stats?.hot ?? 0,
      });
    }
    agents.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return agentListSchema.parse({ agents });
  }

  private async audit(
    tx: Transaction,
    workspace: WorkspaceContext,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      tenantId: workspace.tenantId,
      actorUserId: workspace.userId,
      action,
      target,
      metadata,
    });
  }
}

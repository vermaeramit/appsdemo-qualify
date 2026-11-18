import { z } from 'zod';

/**
 * Multi-agent routing (FR-4.8, D-086): which agent (playbook) handles a lead, by where it came
 * from. A lead that matches no rule goes to the default agent.
 */
export const playbookRouteSchema = z.object({
  /** form = Meta lead form id; ad = Meta ad id (form or Click-to-WhatsApp); campaign = API. */
  type: z.enum(['form', 'ad', 'campaign']),
  value: z.string().trim().min(1).max(200),
  /** Shown in the UI (form name, ad headline). */
  label: z.string().trim().max(200).optional(),
});
export type PlaybookRoute = z.infer<typeof playbookRouteSchema>;
export const playbookRoutesSchema = z.array(playbookRouteSchema).max(100);

export const agentSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isDefault: z.boolean(),
  templateKey: z.string().nullable(),
  versionNo: z.number().int(),
  questions: z.number().int(),
  routes: playbookRoutesSchema,
});
export type AgentSummary = z.infer<typeof agentSummarySchema>;

export const agentListSchema = z.object({ agents: z.array(agentSummarySchema) });
export type AgentList = z.infer<typeof agentListSchema>;

/** POST /api/agents — a new agent from a template, or a copy of another agent. */
export const createAgentSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  template: z.string().max(40).optional(),
  copyFrom: z.uuid().optional(),
});
export type CreateAgent = z.infer<typeof createAgentSchema>;

/** PATCH /api/agents/:id */
export const updateAgentSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  routes: playbookRoutesSchema.optional(),
  /** Make this the default agent (the previous default stops being it). */
  isDefault: z.literal(true).optional(),
});
export type UpdateAgent = z.infer<typeof updateAgentSchema>;

/** GET /api/agents/route-options — forms, ads and campaigns seen recently, to pick from. */
export const routeOptionsSchema = z.object({
  forms: z.array(z.object({ value: z.string(), label: z.string() })),
  ads: z.array(z.object({ value: z.string(), label: z.string() })),
  campaigns: z.array(z.object({ value: z.string(), label: z.string() })),
});
export type RouteOptions = z.infer<typeof routeOptionsSchema>;

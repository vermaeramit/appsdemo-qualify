import type { AgentSummary, PlaybookRoute } from '@qualify/shared';

export const ROUTE_TYPES: { type: PlaybookRoute['type']; label: string; hint: string }[] = [
  { type: 'form', label: 'Meta lead forms', hint: 'Leads from these forms' },
  { type: 'ad', label: 'Ads', hint: 'Leads from these ads (lead form or Click-to-WhatsApp)' },
  { type: 'campaign', label: 'API campaigns', hint: 'API leads with this "campaign" value' },
];

export const routeText = (route: PlaybookRoute) => route.label ?? route.value;

/** One line on which leads an agent handles (D-086). */
export function routingSummary(agent: AgentSummary, agentCount: number): string {
  if (agent.isDefault) {
    return agentCount > 1
      ? 'Default agent: handles every lead that no rule sends to another agent.'
      : 'Handles every lead. Add another agent to give some campaigns or forms their own questions.';
  }
  if (agent.routes.length) {
    return `Handles leads from ${agent.routes.map(routeText).join(', ')}. Others go to the default agent.`;
  }
  return 'No rules yet: this agent gets no leads. Open the agent settings to add forms, ads or campaigns.';
}

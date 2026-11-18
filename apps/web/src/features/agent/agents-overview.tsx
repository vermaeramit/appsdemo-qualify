import type { AgentSummary } from '@qualify/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bot, ChevronRight, Plus, Route as RouteIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { NewAgentDialog } from './agent-dialogs';
import { routeText } from './routing';

const MAX_CHIPS = 3;

/** The AI agent page landing: one card per agent, plus a card to add one (D-087). */
export function AgentsOverview({ agents, canEdit }: { agents: AgentSummary[]; canEdit: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI agents</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Each agent has its own questions, wording, opening and scoring. A lead goes to the agent
          its form, ad or campaign is routed to; every other lead goes to the default agent.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canEdit && (
          <li>
            <NewAgentDialog
              agents={agents}
              onCreated={(agent) => void navigate({ to: '/agent', search: { agent: agent.id } })}
            >
              <button
                type="button"
                className="group flex h-full min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-5 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
                  <Plus className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">New agent</span>
                  <span className="block text-xs text-muted-foreground">
                    Own questions for a campaign, form or ad
                  </span>
                </span>
              </button>
            </NewAgentDialog>
          </li>
        )}
        {agents.map((agent, index) => (
          <motion.li
            key={agent.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.04 }}
          >
            <AgentCard agent={agent} agentCount={agents.length} />
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function AgentCard({ agent, agentCount }: { agent: AgentSummary; agentCount: number }) {
  const extra = agent.routes.length - MAX_CHIPS;
  return (
    <Link
      to="/agent"
      search={{ agent: agent.id }}
      className="group flex h-full min-h-44 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{agent.name}</p>
            {agent.isDefault && (
              <Badge variant="secondary" className="shrink-0">
                Default
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="text-success">● Live v{agent.versionNo}</span> · {agent.questions}{' '}
            {agent.questions === 1 ? 'question' : 'questions'}
          </p>
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Leads · 30 days</dt>
          <dd className="text-lg font-semibold tabular-nums">{agent.recentLeads}</dd>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Hot</dt>
          <dd
            className={cn(
              'text-lg font-semibold tabular-nums',
              agent.recentHot > 0 && 'text-grade-hot',
            )}
          >
            {agent.recentHot}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex min-w-0 items-start gap-1.5 border-t pt-3 text-xs text-muted-foreground">
        <RouteIcon className="mt-px size-3.5 shrink-0" />
        {agent.isDefault ? (
          <span>{agentCount > 1 ? 'Every lead no rule sends elsewhere' : 'Every lead'}</span>
        ) : agent.routes.length ? (
          <span className="flex min-w-0 flex-wrap gap-1">
            {agent.routes.slice(0, MAX_CHIPS).map((route) => (
              <span
                key={`${route.type}:${route.value}`}
                className="max-w-40 truncate rounded-full bg-primary/10 px-2 py-0.5 text-primary"
              >
                {routeText(route)}
              </span>
            ))}
            {extra > 0 && <span className="px-1 py-0.5">+{extra} more</span>}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-grade-warm">
            No rules yet, so it gets no leads
          </span>
        )}
      </div>
    </Link>
  );
}

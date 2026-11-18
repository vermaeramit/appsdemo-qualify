import { useState } from 'react';
import { PLAYBOOK_TEMPLATES } from '@qualify/core';
import {
  type AgentSummary,
  agentListSchema,
  agentSummarySchema,
  type PlaybookRoute,
} from '@qualify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, Plus, Route as RouteIcon, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiDelete, apiSend, errorMessage } from '@/lib/api';
import { routeOptionsQueryOptions } from './queries';

const ROUTE_TYPES: { type: PlaybookRoute['type']; label: string; hint: string }[] = [
  { type: 'form', label: 'Meta lead forms', hint: 'Leads from these forms' },
  { type: 'ad', label: 'Ads', hint: 'Leads from these ads (lead form or Click-to-WhatsApp)' },
  { type: 'campaign', label: 'API campaigns', hint: 'API leads with this "campaign" value' },
];

const routeText = (route: PlaybookRoute) => route.label ?? route.value;

/** Which agent is being edited, and managing agents and their routing rules (D-086). */
export function AgentBar({
  agents,
  current,
  canEdit,
}: {
  agents: AgentSummary[];
  current: AgentSummary;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const go = (agent: AgentSummary) =>
    void navigate({ to: '/agent', search: agent.isDefault ? {} : { agent: agent.id } });

  return (
    <div className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="agent-switcher" className="text-sm text-muted-foreground">
          Agent
        </Label>
        <Select
          value={current.id}
          onValueChange={(id) => {
            const next = agents.find((agent) => agent.id === id);
            if (next) go(next);
          }}
        >
          <SelectTrigger id="agent-switcher" className="h-8 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
                {agent.isDefault ? ' (default)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit && <NewAgentDialog current={current} onCreated={go} />}
        {canEdit && (
          <AgentSettingsDialog
            agent={current}
            onDeleted={() => {
              const fallback = agents.find((agent) => agent.isDefault);
              if (fallback) go(fallback);
            }}
          />
        )}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <RouteIcon className="mt-px size-3.5 shrink-0" />
        {current.isDefault ? (
          agents.length > 1 ? (
            'Default agent: handles every lead that no rule sends to another agent.'
          ) : (
            'Handles every lead. Add another agent to give some campaigns or forms their own questions.'
          )
        ) : current.routes.length ? (
          <span>
            Handles leads from {current.routes.map((route) => routeText(route)).join(', ')}. Others
            go to the default agent.
          </span>
        ) : (
          'No rules yet: this agent gets no leads. Open the agent settings to add forms, ads or campaigns.'
        )}
      </p>
    </div>
  );
}

function NewAgentDialog({
  current,
  onCreated,
}: {
  current: AgentSummary;
  onCreated: (agent: AgentSummary) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [source, setSource] = useState('copy');
  const create = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        '/api/agents',
        source === 'copy' ? { name, copyFrom: current.id } : { name, template: source },
        agentSummarySchema,
      ),
    onSuccess: async (agent) => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(`Created “${agent.name}”`, {
        description: 'Add its routing rules in the agent settings, then review and publish.',
      });
      setOpen(false);
      setName('');
      onCreated(agent);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus data-icon="inline-start" />
          New agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New agent</DialogTitle>
          <DialogDescription>
            An agent has its own questions, wording, opening and scoring. Routing rules decide which
            leads it handles; the rest stay with the default agent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              placeholder="e.g. International tours"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-source">Start from</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="agent-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="copy">A copy of “{current.name}”</SelectItem>
                {PLAYBOOK_TEMPLATES.map((template) => (
                  <SelectItem key={template.key} value={template.key}>
                    Template: {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {create.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(create.error, 'Could not create the agent.')}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Create agent
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgentSettingsDialog({ agent, onDeleted }: { agent: AgentSummary; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(agent.name);
  const [routes, setRoutes] = useState<PlaybookRoute[]>(agent.routes);
  const options = useQuery({ ...routeOptionsQueryOptions, enabled: open && !agent.isDefault });

  const save = useMutation({
    mutationFn: (body: { name?: string; routes?: PlaybookRoute[]; isDefault?: true }) =>
      apiSend('PATCH', `/api/agents/${agent.id}`, body, agentListSchema),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agent saved');
      setOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/agents/${agent.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success(`Deleted “${agent.name}”`);
      setOpen(false);
      onDeleted();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the agent.')),
  });

  const add = (route: PlaybookRoute) =>
    setRoutes((current) =>
      current.some((item) => item.type === route.type && item.value === route.value)
        ? current
        : [...current, route],
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(agent.name);
          setRoutes(agent.routes);
          save.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Settings2 data-icon="inline-start" />
          Agent settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Agent settings</DialogTitle>
          <DialogDescription>
            {agent.isDefault
              ? 'The default agent handles every lead that no rule sends to another agent.'
              : 'Leads that match any rule below go to this agent when they arrive.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-settings-name">Name</Label>
            <Input
              id="agent-settings-name"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {!agent.isDefault &&
            ROUTE_TYPES.map((group) => {
              const picked = routes.filter((route) => route.type === group.type);
              const choices = (
                group.type === 'form'
                  ? options.data?.forms
                  : group.type === 'ad'
                    ? options.data?.ads
                    : options.data?.campaigns
              )?.filter((choice) => !picked.some((route) => route.value === choice.value));
              return (
                <div key={group.type} className="space-y-1.5">
                  <p className="text-sm font-medium">{group.label}</p>
                  <p className="text-xs text-muted-foreground">{group.hint}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {picked.map((route) => (
                      <span
                        key={route.value}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                      >
                        {routeText(route)}
                        <button
                          type="button"
                          aria-label={`Remove ${routeText(route)}`}
                          onClick={() =>
                            setRoutes((current) =>
                              current.filter(
                                (item) => !(item.type === route.type && item.value === route.value),
                              ),
                            )
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <RouteAdder type={group.type} choices={choices ?? []} onAdd={add} />
                </div>
              );
            })}
          {save.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(save.error, 'Could not save the agent.')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!agent.isDefault && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={save.isPending}
                  onClick={() => save.mutate({ isDefault: true })}
                >
                  Make default
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive">
                      <Trash2 data-icon="inline-start" />
                      Delete agent
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{agent.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Its questions, versions and rules are deleted. Leads it was handling
                        continue with the agent their source routes to (usually the default).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            <Button
              type="button"
              className="ml-auto"
              disabled={!name.trim() || save.isPending}
              onClick={() =>
                save.mutate({ name: name.trim(), ...(agent.isDefault ? {} : { routes }) })
              }
            >
              {save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Pick a form / ad / campaign seen recently, or type an id or campaign name. */
function RouteAdder({
  type,
  choices,
  onAdd,
}: {
  type: PlaybookRoute['type'];
  choices: { value: string; label: string }[];
  onAdd: (route: PlaybookRoute) => void;
}) {
  const [typed, setTyped] = useState('');
  const placeholder =
    type === 'form' ? 'Form id' : type === 'ad' ? 'Ad id' : 'Campaign, e.g. Europe Summer';
  return (
    <div className="flex flex-wrap gap-2">
      {choices.length > 0 && (
        <Select
          value=""
          onValueChange={(value) => {
            const choice = choices.find((item) => item.value === value);
            if (choice) onAdd({ type, value: choice.value, label: choice.label });
          }}
        >
          <SelectTrigger className="h-8 w-56" aria-label={`Add ${type}`}>
            <SelectValue placeholder="Pick one seen recently" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input
        className="h-8 w-56"
        aria-label={`Type a ${type}`}
        placeholder={placeholder}
        value={typed}
        maxLength={200}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && typed.trim()) {
            event.preventDefault();
            onAdd({ type, value: typed.trim() });
            setTyped('');
          }
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!typed.trim()}
        onClick={() => {
          onAdd({ type, value: typed.trim() });
          setTyped('');
        }}
      >
        Add
      </Button>
    </div>
  );
}

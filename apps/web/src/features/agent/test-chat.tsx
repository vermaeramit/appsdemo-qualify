import { useRef, useState } from 'react';
import {
  type AgentLanguage,
  type PlaybookConfig,
  playbookConfigSchema,
  type SimulateResponse,
  simulateResponseSchema,
} from '@qualify/shared';
import { useMutation } from '@tanstack/react-query';
import { Bot, FlaskConical, ListChecks, Loader2, RotateCcw, Send } from 'lucide-react';
import { GradeBadge } from '@/components/leads/grade-badge';
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
import { LeadStatusBadge } from '@/features/conversations/lead-status';
import { apiSend, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ChatMessage {
  from: 'lead' | 'agent';
  text: string;
  options?: SimulateResponse['options'];
}

interface ChatState {
  messages: ChatMessage[];
  fields: Record<string, string>;
  status: SimulateResponse['status'];
  language: AgentLanguage | null;
  last: SimulateResponse | null;
  costUsd: number;
}

const EMPTY: ChatState = {
  messages: [],
  fields: {},
  status: 'new',
  language: null,
  last: null,
  costUsd: 0,
};

/** Chat with the agent as a lead would, using the editor's draft (nothing goes to WhatsApp). */
export function TestChat({ getConfig }: { getConfig: () => PlaybookConfig }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FlaskConical data-icon="inline-start" />
          Test chat
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90svh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Test chat</DialogTitle>
          <DialogDescription>
            Write as a lead. The agent answers with your current changes, published or not. Nothing
            is sent on WhatsApp or saved.
          </DialogDescription>
        </DialogHeader>
        {open && <ChatBody getConfig={getConfig} />}
      </DialogContent>
    </Dialog>
  );
}

function ChatBody({ getConfig }: { getConfig: () => PlaybookConfig }) {
  const [state, setState] = useState<ChatState>(EMPTY);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const scrollDown = () =>
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end' }));

  const turn = useMutation({
    mutationFn: async (messages: ChatMessage[]) => {
      const parsed = playbookConfigSchema.safeParse(getConfig());
      if (!parsed.success) {
        throw new Error('Some settings need attention first (see the highlighted tabs).');
      }
      return apiSend(
        'POST',
        '/api/playbook/simulate',
        {
          config: parsed.data,
          messages: messages.map(({ from, text: body }) => ({ from, text: body })),
          fields: state.fields,
          status: state.status,
          language: state.language,
        },
        simulateResponseSchema,
      );
    },
    onSuccess: (result) => {
      setState((current) => ({
        messages: [
          ...current.messages,
          { from: 'agent', text: result.reply, options: result.options },
        ],
        fields: result.fields,
        status: result.status,
        language: result.language ?? current.language,
        last: result,
        costUsd: current.costUsd + (result.usage.costUsd ?? 0),
      }));
      scrollDown();
    },
  });

  const send = (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || turn.isPending) return;
    const messages: ChatMessage[] = [...state.messages, { from: 'lead', text: trimmed }];
    setState((current) => ({ ...current, messages }));
    setText('');
    scrollDown();
    turn.mutate(messages);
  };

  const definitions = getConfig().fields;
  const lastAgent = state.messages.at(-1)?.from === 'agent' ? state.messages.at(-1) : undefined;

  return (
    <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_15rem]">
      <div className="flex min-h-[420px] min-w-0 flex-col rounded-xl border">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3">
          {state.messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Start like a lead would, e.g. “Hi, I saw your ad. Can you share details?”
            </p>
          )}
          {state.messages.map((message, index) => (
            <div
              key={index}
              className={cn('flex', message.from === 'lead' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                  message.from === 'lead'
                    ? 'rounded-br-md bg-primary text-primary-foreground'
                    : 'rounded-bl-md border bg-card',
                )}
              >
                {message.from === 'agent' && (
                  <div className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-medium opacity-70">
                    <Bot className="size-3" />
                    AI agent
                  </div>
                )}
                <p className="break-words whitespace-pre-wrap">{message.text}</p>
              </div>
            </div>
          ))}
          {turn.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              The agent is typing…
            </div>
          )}
          {turn.isError && (
            <p className="text-xs text-destructive">
              {errorMessage(turn.error, 'The agent could not answer. Try again.')}
            </p>
          )}
          <div ref={bottom} />
        </div>

        {lastAgent?.options && lastAgent.options.kind !== 'none' && !turn.isPending && (
          <div className="flex flex-wrap gap-1.5 border-t p-2">
            {lastAgent.options.kind === 'list' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ListChecks className="size-3.5" />
                {lastAgent.options.buttonLabel}:
              </span>
            )}
            {(lastAgent.options.kind === 'buttons'
              ? lastAgent.options.buttons
              : lastAgent.options.rows
            ).map((option) => (
              <Button
                key={option}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => send(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        )}

        <form
          className="flex gap-2 border-t p-2"
          onSubmit={(event) => {
            event.preventDefault();
            // The dialog is portaled, but React still bubbles submit to the editor's form,
            // which would publish the playbook.
            event.stopPropagation();
            send(text);
          }}
        >
          <Input
            aria-label="Message as the lead"
            placeholder="Type as the lead…"
            value={text}
            maxLength={1000}
            onChange={(event) => setText(event.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={!text.trim() || turn.isPending}
          >
            <Send />
          </Button>
        </form>
      </div>

      <aside className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <LeadStatusBadge status={state.status} />
          </div>
          {state.last?.score && (
            <div className="flex items-center justify-between" title={state.last.score.reason}>
              <span className="text-xs font-medium text-muted-foreground">Score</span>
              <span className="flex items-center gap-1.5">
                <GradeBadge grade={state.last.score.grade} />
                <span className="tabular-nums">{state.last.score.score}</span>
              </span>
            </div>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Answers</p>
          <dl className="space-y-1.5">
            {definitions.map((field) => (
              <div key={field.key}>
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd
                  className={cn(
                    'break-words',
                    state.last?.changed.includes(field.key) && 'font-medium text-success',
                    !state.fields[field.key] && 'text-muted-foreground/60',
                  )}
                >
                  {state.fields[field.key] ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
          {state.last && state.last.rejected.length > 0 && (
            <p className="mt-2 text-xs text-grade-warm">
              Not accepted:{' '}
              {state.last.rejected.map((item) => `${item.key} (${item.reason})`).join('; ')}
            </p>
          )}
        </div>
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            AI cost so far: ${state.costUsd.toFixed(4)}
            {state.last &&
              ` · ${state.last.usage.model} · ${(state.last.usage.latencyMs / 1000).toFixed(1)} s`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.messages.length === 0 || turn.isPending}
            onClick={() => setState(EMPTY)}
          >
            <RotateCcw data-icon="inline-start" />
            Start over
          </Button>
        </div>
      </aside>
    </div>
  );
}

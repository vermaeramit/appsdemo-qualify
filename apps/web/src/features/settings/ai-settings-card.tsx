import { useState } from 'react';
import { type WorkspaceAi, workspaceAiSchema } from '@qualify/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, KeyRound, Loader2, TriangleAlert } from 'lucide-react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { money, modelLabel } from '@/lib/ai-format';
import { apiDelete, apiSend, errorMessage, fetchJson } from '@/lib/api';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { canManage } from '@/lib/workspace';
import { cn } from '@/lib/utils';

const aiQueryOptions = queryOptions({
  queryKey: ['ai'] as const,
  queryFn: () => fetchJson('/api/ai', workspaceAiSchema),
  // Always fresh when Settings opens: AppsDemo can switch the AI or hit a limit meanwhile.
  staleTime: 0,
});

const MODE_TEXT: Record<WorkspaceAi['mode'], { badge: string; tone: string }> = {
  own_key: { badge: 'Your OpenAI key', tone: 'bg-success/10 text-success' },
  platform: { badge: "AppsDemo's key", tone: 'bg-primary/10 text-primary' },
  off: { badge: 'AI off', tone: 'bg-destructive/10 text-destructive' },
};

/** Settings → AI (D-094): the workspace's own OpenAI key, AppsDemo's key, or off; the model. */
export function AiSettingsCard() {
  const workspace = useActiveWorkspace();
  const editable = canManage(workspace);
  const query = useQuery(aiQueryOptions);
  const [replacing, setReplacing] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-4" />
          AI
          {query.data && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                MODE_TEXT[query.data.mode].tone,
              )}
            >
              {MODE_TEXT[query.data.mode].badge}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          The AI that replies to your leads runs on an OpenAI account: your own key, or AppsDemo's.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(query.error, 'Could not load the AI settings.')}
          </p>
        ) : (
          <AiSettingsBody
            ai={query.data}
            editable={editable}
            replacing={replacing}
            setReplacing={setReplacing}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AiSettingsBody({
  ai,
  editable,
  replacing,
  setReplacing,
}: {
  ai: WorkspaceAi;
  editable: boolean;
  replacing: boolean;
  setReplacing: (value: boolean) => void;
}) {
  const current = ai.models.find((model) => model.id === ai.model);

  if (ai.mode === 'off') {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            The AI is off, so leads get no replies. Add your OpenAI key below, or ask AppsDemo to
            switch on its key for you.
          </span>
        </p>
        {editable && <KeyForm ai={ai} submitLabel="Save key and turn the AI on" />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <dl className="divide-y rounded-lg border text-sm">
        {ai.mode === 'own_key' && (
          <Row label="OpenAI key">
            <span className="font-mono text-xs">{ai.keyHint}</span>
          </Row>
        )}
        <Row label="Model">
          {ai.mode === 'own_key' && editable ? (
            <ModelSelect ai={ai} />
          ) : (
            <span>{current ? modelLabel(current) : ai.model}</span>
          )}
        </Row>
        {ai.mode === 'platform' && (
          <Row label="This month">
            {money(ai.spentThisMonthUsd)}
            {ai.monthlyLimitUsd !== null ? ` of ${money(ai.monthlyLimitUsd)}` : ' (no limit)'}
          </Row>
        )}
      </dl>

      {ai.mode === 'platform' && ai.limitReached && (
        <p className="flex items-start gap-2 rounded-lg border border-grade-warm/40 bg-grade-warm/8 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-grade-warm" />
          This month's AI limit is used up, so the AI has stopped replying. Ask AppsDemo to raise
          it, or add your own OpenAI key.
        </p>
      )}
      {ai.mode === 'platform' && !ai.limitReached && (
        <p className="text-xs text-muted-foreground">
          AppsDemo provides the AI for this workspace and chooses the model.
        </p>
      )}

      {editable &&
        (replacing ? (
          <KeyForm
            ai={ai}
            submitLabel={ai.mode === 'own_key' ? 'Save the new key' : 'Use our own key'}
            onDone={() => setReplacing(false)}
            onCancel={() => setReplacing(false)}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
              <KeyRound data-icon="inline-start" />
              {ai.mode === 'own_key' ? 'Replace key' : 'Use our own OpenAI key instead'}
            </Button>
            {ai.mode === 'own_key' && <RemoveKeyButton />}
          </div>
        ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function ModelSelect({ ai }: { ai: WorkspaceAi }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (model: string) => apiSend('PUT', '/api/ai/model', { model }, workspaceAiSchema),
    onSuccess: (data) => {
      queryClient.setQueryData(aiQueryOptions.queryKey, data);
      toast.success(`The AI now uses ${data.model}`);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change the model.')),
  });
  return (
    <Select
      value={ai.model}
      onValueChange={(model) => change.mutate(model)}
      disabled={change.isPending}
    >
      <SelectTrigger className="w-full max-w-sm" aria-label="Model">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ai.models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {modelLabel(model)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function KeyForm({
  ai,
  submitLabel,
  onDone,
  onCancel,
}: {
  ai: WorkspaceAi;
  submitLabel: string;
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const initialModel = ai.models.some((model) => model.id === ai.model)
    ? ai.model
    : (ai.models[0]?.id ?? ai.defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(initialModel);
  const save = useMutation({
    mutationFn: () =>
      apiSend('PUT', '/api/ai/key', { apiKey: apiKey.trim(), model }, workspaceAiSchema),
    onSuccess: (data) => {
      queryClient.setQueryData(aiQueryOptions.queryKey, data);
      setApiKey('');
      toast.success('Key checked with OpenAI and saved. The AI now uses it.');
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the key.')),
  });
  const looksValid = /^sk-[A-Za-z0-9_-]{16,}$/.test(apiKey.trim());

  return (
    <form
      className="space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (looksValid) save.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="openai-key">OpenAI API key</Label>
        <Input
          id="openai-key"
          type="password"
          autoComplete="off"
          placeholder="sk-…"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Create one at platform.openai.com → API keys. We check it with OpenAI, store it encrypted,
          and only ever show its last 4 characters.
        </p>
        {apiKey.trim() !== '' && !looksValid && (
          <p className="text-xs font-medium text-destructive">
            {apiKey.trim().startsWith('sk-')
              ? 'This key looks too short: paste the whole key.'
              : 'An OpenAI key starts with "sk-".'}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="openai-model">Model</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger id="openai-model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ai.models.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {modelLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Prices per 1M tokens, billed by OpenAI to your account.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!looksValid || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function RemoveKeyButton() {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async () => {
      await apiDelete('/api/ai/key');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: aiQueryOptions.queryKey });
      toast.success('Key removed');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove the key.')),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          Remove key
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the OpenAI key?</AlertDialogTitle>
          <AlertDialogDescription>
            The AI stops replying to leads until a key is added again (or AppsDemo switches on its
            key).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => remove.mutate()}>Remove key</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { useState } from 'react';
import {
  type AdminWorkspaceAi,
  adminWorkspaceAiSchema,
  type AiModel,
  aiModelListSchema,
  type ImportedAiPrices,
  importedAiPricesSchema,
} from '@qualify/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money, modelLabel } from '@/lib/ai-format';
import { apiSend, errorMessage, fetchJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';

const modelsQueryOptions = queryOptions({
  queryKey: ['admin', 'ai-models'] as const,
  queryFn: () => fetchJson('/api/admin/ai/models', aiModelListSchema),
});

const MODE_BADGE: Record<
  AdminWorkspaceAi['mode'],
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  platform: { label: "AppsDemo's key", variant: 'default' },
  own_key: { label: 'Own key', variant: 'secondary' },
  off: { label: 'AI off', variant: 'outline' },
};

/** The workspace's AI on the admin table, with "Manage" (D-094). */
export function WorkspaceAiCell({
  workspace,
}: {
  workspace: { id: string; name: string; ai: AdminWorkspaceAi };
}) {
  const [open, setOpen] = useState(false);
  const { ai } = workspace;
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0">
        <Badge variant={MODE_BADGE[ai.mode].variant}>{MODE_BADGE[ai.mode].label}</Badge>
        {ai.mode !== 'off' && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {ai.model}
            {ai.mode === 'platform' &&
              ` · ${money(ai.spentThisMonthUsd)}${ai.monthlyLimitUsd !== null ? ` / ${money(ai.monthlyLimitUsd)}` : ''}`}
          </div>
        )}
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Manage AI for ${workspace.name}`}
        onClick={() => setOpen(true)}
      >
        <Settings2 />
      </Button>
      {open && <WorkspaceAiDialog workspace={workspace} onClose={() => setOpen(false)} />}
    </div>
  );
}

function WorkspaceAiDialog({
  workspace,
  onClose,
}: {
  workspace: { id: string; name: string; ai: AdminWorkspaceAi };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const models = useQuery(modelsQueryOptions);
  const { ai } = workspace;
  const [model, setModel] = useState(ai.model ?? 'gpt-5.4-mini');
  const [limit, setLimit] = useState(ai.monthlyLimitUsd === null ? '' : String(ai.monthlyLimitUsd));
  const limitValue = limit.trim() === '' ? null : Number(limit);
  const limitValid = limitValue === null || (Number.isFinite(limitValue) && limitValue > 0);

  const save = useMutation({
    mutationFn: (body: object) =>
      apiSend('PUT', `/api/admin/workspaces/${workspace.id}/ai`, body, adminWorkspaceAiSchema),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
      toast.success(
        data.mode === 'platform'
          ? `AppsDemo's key is on for ${workspace.name}`
          : `AppsDemo's key is off for ${workspace.name}`,
      );
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not change the AI.')),
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI for {workspace.name}</DialogTitle>
          <DialogDescription>
            For clients without an OpenAI account: the AI runs on AppsDemo's key, up to the monthly
            limit. The workspace sees this in its Settings and Logs.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          Now: <span className="font-medium">{MODE_BADGE[ai.mode].label}</span>
          {ai.mode === 'platform' && ` · ${money(ai.spentThisMonthUsd)} spent this month`}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="workspace-ai-model">Model</Label>
          {models.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="workspace-ai-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(models.data?.models ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {modelLabel(option)}
                    {!option.enabled && ' (hidden from clients)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="workspace-ai-limit">Monthly limit (USD)</Label>
          <Input
            id="workspace-ai-limit"
            inputMode="decimal"
            placeholder="No limit"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The AI stops for the rest of the month when it is reached. Empty = no limit.
          </p>
          {!limitValid && (
            <p className="text-xs font-medium text-destructive">Enter an amount above 0.</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {ai.mode === 'platform' ? (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({ mode: 'off' })}
            >
              Stop AppsDemo's key
            </Button>
          ) : (
            <span />
          )}
          <Button
            disabled={save.isPending || !limitValid}
            onClick={() => save.mutate({ mode: 'platform', model, monthlyLimitUsd: limitValue })}
          >
            {save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {ai.mode === 'platform' ? 'Save' : "Use AppsDemo's key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Draft = Pick<AiModel, 'id' | 'label' | 'enabled'> & {
  inputUsd: string;
  cachedUsd: string;
  outputUsd: string;
};

const toDraft = (model: AiModel): Draft => ({
  id: model.id,
  label: model.label,
  enabled: model.enabled,
  inputUsd: String(model.inputUsd),
  cachedUsd: String(model.cachedUsd),
  outputUsd: String(model.outputUsd),
});

const priceOk = (value: string) =>
  value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

/** The models clients may pick and their prices per 1M tokens (D-094). */
export function AiModelsCard() {
  const queryClient = useQueryClient();
  const query = useQuery(modelsQueryOptions);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState<Draft | null>(null);
  const [imported, setImported] = useState<ImportedAiPrices | null>(null);

  const save = useMutation({
    mutationFn: (models: object[]) =>
      apiSend('PUT', '/api/admin/ai/models', { models }, aiModelListSchema),
    onSuccess: (data) => {
      queryClient.setQueryData(modelsQueryOptions.queryKey, data);
      setDrafts({});
      setAdding(null);
      setImported(null);
      toast.success('Models and prices saved');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the models.')),
  });
  const importPrices = useMutation({
    mutationFn: () =>
      apiSend('POST', '/api/admin/ai/models/import', undefined, importedAiPricesSchema),
    onSuccess: setImported,
    onError: (error) => toast.error(errorMessage(error, 'Could not load the prices.')),
  });

  const changed = Object.values(drafts);
  const draftsValid = changed.every(
    (draft) => priceOk(draft.inputUsd) && priceOk(draft.cachedUsd) && priceOk(draft.outputUsd),
  );
  const toPayload = (draft: Draft) => ({
    id: draft.id.trim(),
    label: draft.label?.trim() || null,
    enabled: draft.enabled,
    inputUsd: Number(draft.inputUsd),
    cachedUsd: Number(draft.cachedUsd),
    outputUsd: Number(draft.outputUsd),
    source: 'manual' as const,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI models & prices</CardTitle>
        <CardDescription>
          Models clients can choose, with OpenAI's price per 1M tokens. Costs, the Costs page and
          the monthly limits use these prices.
        </CardDescription>
        <CardAction className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={importPrices.isPending}
            onClick={() => importPrices.mutate()}
          >
            {importPrices.isPending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            Import latest prices
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setAdding({
                id: '',
                label: null,
                enabled: true,
                inputUsd: '',
                cachedUsd: '',
                outputUsd: '',
              })
            }
          >
            <Plus data-icon="inline-start" />
            Add model
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(query.error, 'Could not load the models.')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Cached input</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead>Clients can pick</TableHead>
                  <TableHead>Prices from</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ...query.data.models.map((model) => drafts[model.id] ?? toDraft(model)),
                  ...(adding ? [adding] : []),
                ].map((draft, index) => {
                  const isNew = adding !== null && index === query.data.models.length;
                  const original = query.data.models.find((model) => model.id === draft.id);
                  const update = (patch: Partial<Draft>) =>
                    isNew
                      ? setAdding({ ...draft, ...patch })
                      : setDrafts((current) => ({
                          ...current,
                          [draft.id]: { ...draft, ...patch },
                        }));
                  return (
                    <TableRow key={isNew ? '__new' : draft.id}>
                      <TableCell className="min-w-44">
                        {isNew ? (
                          <Input
                            aria-label="New model id"
                            placeholder="gpt-…"
                            value={draft.id}
                            onChange={(event) => update({ id: event.target.value })}
                            className="h-8 font-mono text-xs"
                          />
                        ) : (
                          <>
                            <div className="font-mono text-xs font-medium">{draft.id}</div>
                            {draft.label && (
                              <div className="text-xs text-muted-foreground">{draft.label}</div>
                            )}
                          </>
                        )}
                      </TableCell>
                      {(['inputUsd', 'cachedUsd', 'outputUsd'] as const).map((field) => (
                        <TableCell key={field}>
                          <Input
                            aria-label={`${draft.id || 'New model'} ${field}`}
                            inputMode="decimal"
                            value={draft[field]}
                            onChange={(event) => update({ [field]: event.target.value })}
                            className="h-8 w-24 text-xs"
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Switch
                          checked={draft.enabled}
                          onCheckedChange={(enabled) => update({ enabled })}
                          aria-label={`Clients can pick ${draft.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {original
                          ? `${original.source === 'openrouter' ? 'Import' : 'Manual'} · ${timeAgo(original.pricesUpdatedAt)}`
                          : 'New'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {(changed.length > 0 || adding) && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={
                save.isPending ||
                !draftsValid ||
                (adding !== null &&
                  !(
                    /^[a-z0-9][a-z0-9.-]*$/i.test(adding.id.trim()) &&
                    priceOk(adding.inputUsd) &&
                    priceOk(adding.cachedUsd) &&
                    priceOk(adding.outputUsd)
                  ))
              }
              onClick={() => save.mutate([...changed, ...(adding ? [adding] : [])].map(toPayload))}
            >
              {save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Save changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDrafts({});
                setAdding(null);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          USD per 1M tokens. Cached input is the price for prompt tokens OpenAI reuses from its
          cache.
        </p>
      </CardContent>
      {imported && query.data && (
        <ImportDialog
          imported={imported}
          models={query.data.models}
          saving={save.isPending}
          onClose={() => setImported(null)}
          onSave={(rows) => save.mutate(rows)}
        />
      )}
    </Card>
  );
}

function ImportDialog({
  imported,
  models,
  saving,
  onClose,
  onSave,
}: {
  imported: ImportedAiPrices;
  models: AiModel[];
  saving: boolean;
  onClose: () => void;
  onSave: (rows: object[]) => void;
}) {
  const known = new Map(models.map((model) => [model.id, model]));
  const differs = (row: ImportedAiPrices['models'][number]) =>
    row.current !== null &&
    (row.current.inputUsd !== row.inputUsd ||
      row.current.cachedUsd !== row.cachedUsd ||
      row.current.outputUsd !== row.outputUsd);
  // Our models whose price changed are ticked; new models are offered, unticked.
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(imported.models.filter(differs).map((row) => row.id)),
  );
  const [showAll, setShowAll] = useState(false);
  const rows = imported.models.filter((row) => showAll || row.current !== null);
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Latest OpenAI prices</DialogTitle>
          <DialogDescription>
            From OpenRouter's public list (its prices for OpenAI models are OpenAI's). Tick the rows
            to save. New models are added hidden from clients until you switch them on.
          </DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showAll} onCheckedChange={setShowAll} />
          Show models we don't list yet (
          {imported.models.filter((row) => row.current === null).length})
        </label>
        <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Model</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Cached</TableHead>
                <TableHead>Output</TableHead>
                <TableHead>Today</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Save ${row.id}`}
                      checked={picked.has(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.id}</TableCell>
                  <TableCell>{money(row.inputUsd)}</TableCell>
                  <TableCell>{money(row.cachedUsd)}</TableCell>
                  <TableCell>{money(row.outputUsd)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.current === null
                      ? 'Not listed'
                      : differs(row)
                        ? `${money(row.current.inputUsd)} / ${money(row.current.cachedUsd)} / ${money(row.current.outputUsd)}`
                        : 'Same'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving || picked.size === 0}
            onClick={() =>
              onSave(
                imported.models
                  .filter((row) => picked.has(row.id))
                  .map((row) => ({
                    id: row.id,
                    label: known.get(row.id)?.label ?? row.label,
                    inputUsd: row.inputUsd,
                    cachedUsd: row.cachedUsd,
                    outputUsd: row.outputUsd,
                    enabled: known.get(row.id)?.enabled ?? false,
                    source: 'openrouter',
                  })),
              )
            }
          >
            {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Save {picked.size} {picked.size === 1 ? 'model' : 'models'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

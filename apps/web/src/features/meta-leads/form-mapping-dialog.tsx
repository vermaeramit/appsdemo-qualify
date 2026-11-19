import { useState } from 'react';
import { type FormMappingResponse, formMappingResponseSchema } from '@qualify/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiSend, errorMessage, fetchJson } from '@/lib/api';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { canManage } from '@/lib/workspace';

const NOT_USED = '__none';

const SOURCE_TEXT: Record<NonNullable<FormMappingResponse['source']>, string> = {
  ai: 'Mapped by the AI',
  auto: 'Matched by wording',
  manual: 'Edited by your team',
};

const mappingUrl = (formId: string) =>
  `/api/meta-leads/forms/${encodeURIComponent(formId)}/mapping`;

const mappingQueryOptions = (formId: string) =>
  queryOptions({
    queryKey: ['form-mapping', formId] as const,
    queryFn: () => fetchJson(mappingUrl(formId), formMappingResponseSchema),
  });

const humanise = (key: string) => {
  const text = key.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Which AI agent question each form question fills. Owners and managers can correct it. */
export function FormMappingDialog({ formId, formName }: { formId: string; formName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="xs">
          <Workflow data-icon="inline-start" />
          Field mapping
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Field mapping: {formName}</DialogTitle>
          <DialogDescription>
            Which AI agent question each form answer fills. Answers that aren’t used are still kept
            with the submission. Changes apply to new submissions.
          </DialogDescription>
        </DialogHeader>
        {open && <MappingEditor formId={formId} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function MappingEditor({ formId, onDone }: { formId: string; onDone: () => void }) {
  const workspace = useActiveWorkspace();
  const editable = canManage(workspace);
  const queryClient = useQueryClient();
  const query = useQuery(mappingQueryOptions(formId));
  // The team's changes on top of the saved mapping.
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const draft: Record<string, string | null> = Object.fromEntries(
    (query.data?.questions ?? []).map((question) => [
      question.key,
      question.key in edits ? (edits[question.key] ?? null) : question.target,
    ]),
  );

  const save = useMutation({
    mutationFn: () =>
      apiSend('PUT', mappingUrl(formId), { mapping: draft }, formMappingResponseSchema),
    onSuccess: async (saved) => {
      queryClient.setQueryData(mappingQueryOptions(formId).queryKey, saved);
      toast.success('Field mapping saved. New submissions from this form use it.');
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the mapping.')),
  });

  if (query.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {errorMessage(query.error, 'Could not load the mapping.')}
      </p>
    );
  }

  const data = query.data;
  const labelOf = new Map(data.fields.map((field) => [field.key, field.label]));
  // Each AI agent question takes the answer of one form question only.
  const usedBy = new Map(
    Object.entries(draft)
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([key, target]) => [target, key]),
  );

  return (
    <div className="space-y-4">
      {data.source && (
        <p className="text-xs text-muted-foreground">
          {SOURCE_TEXT[data.source]}
          {data.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleString()}` : ''}
        </p>
      )}
      {data.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This form only asks for contact details (name, phone, email), which are always used.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.questions.map((question) => {
            const value = draft[question.key] ?? null;
            return (
              <li
                key={question.key}
                className="grid gap-2 p-3 sm:grid-cols-[1fr_auto_14rem] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={question.key}>
                    {humanise(question.key)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {question.sample ? `e.g. “${question.sample}”` : question.key}
                  </p>
                </div>
                <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
                {editable ? (
                  <Select
                    value={value ?? NOT_USED}
                    onValueChange={(next) =>
                      setEdits((current) => ({
                        ...current,
                        [question.key]: next === NOT_USED ? null : next,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full" aria-label={`Maps ${question.key} to`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_USED}>Not used (kept for reference)</SelectItem>
                      {data.fields.map((field) => {
                        const owner = usedBy.get(field.key);
                        const taken = owner !== undefined && owner !== question.key;
                        return (
                          <SelectItem key={field.key} value={field.key} disabled={taken}>
                            {field.label}
                            {taken ? ' (already used)' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm">
                    {value ? (labelOf.get(value) ?? value) : 'Not used'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && data.questions.length > 0 && (
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Save mapping
          </Button>
        </DialogFooter>
      )}
    </div>
  );
}

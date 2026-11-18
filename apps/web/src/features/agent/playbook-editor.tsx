import { type ReactNode, useMemo, useState } from 'react';
import { type PlaybookResponse, playbookResponseSchema } from '@qualify/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { Eye, Loader2, RotateCcw, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type FieldPath, FormProvider, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError, apiSend, errorMessage } from '@/lib/api';
import { BehaviourEditor, KnowledgeEditor } from './behaviour-editor';
import { type EditorConfig, editorResolver, tabWithError, toEditorConfig } from './form-helpers';
import { FollowUpsEditor } from './follow-ups-editor';
import { ScoringEditor } from './scoring-editor';
import { OpeningEditor } from './opening-editor';
import { agentPlaybookQueryOptions, agentQuery, playbookQueryOptions, useAgentId } from './queries';
import { QuestionsEditor } from './questions-editor';
import { TemplatePicker } from './template-picker';
import { TestChat } from './test-chat';
import { VersionHistory } from './version-history';

const TABS = [
  { value: 'questions', label: 'Questions' },
  { value: 'opening', label: 'Opening' },
  { value: 'followups', label: 'Follow-ups' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'behaviour', label: 'Behaviour' },
  { value: 'knowledge', label: 'Knowledge base' },
] as const;

/**
 * Edits the agent configuration and publishes it as a new version. Remount it (key) with each
 * published version so the form starts clean.
 */
export function PlaybookEditor({
  playbook,
  canEdit,
  title,
  banner,
}: {
  playbook: PlaybookResponse;
  canEdit: boolean;
  /** The agent's name (D-087). */
  title: string;
  /** Shown under the header: which leads this agent handles. */
  banner?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const defaults = useMemo(() => toEditorConfig(playbook.config), [playbook.config]);
  const publishedKeys = useMemo(
    () => new Set(playbook.config.fields.map((field) => field.key)),
    [playbook.config],
  );
  const form = useForm<EditorConfig>({
    resolver: editorResolver,
    defaultValues: defaults,
    reValidateMode: 'onChange',
  });
  const { isDirty, errors } = form.formState;
  const questionCount = useWatch({ control: form.control, name: 'fields' }).length;
  const [tab, setTab] = useState<string>('questions');
  const readOnly = !canEdit;

  useBlocker({
    shouldBlockFn: () => !window.confirm('You have unpublished changes. Leave without publishing?'),
    enableBeforeUnload: () => isDirty,
    disabled: !isDirty,
  });

  const agentId = useAgentId();
  const publish = useMutation({
    mutationFn: (config: EditorConfig) =>
      apiSend('PUT', `/api/playbook${agentQuery(agentId)}`, config, playbookResponseSchema),
    onSuccess: async (published) => {
      queryClient.setQueryData(agentPlaybookQueryOptions(agentId).queryKey, published);
      await queryClient.invalidateQueries({ queryKey: ['playbook', 'template'] });
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      if (!agentId)
        await queryClient.invalidateQueries({ queryKey: playbookQueryOptions.queryKey });
      toast.success(`Published version ${published.versionNo}`, {
        description: 'New conversations use it. Running ones keep their version.',
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.issues.length) {
        for (const issue of error.issues) {
          form.setError(issue.path as FieldPath<EditorConfig>, { message: issue.message });
        }
        const next = tabWithError(form.formState.errors);
        if (next) setTab(next);
      }
      toast.error(errorMessage(error, 'Could not publish. Please try again.'));
    },
  });

  const onPublish = form.handleSubmit(
    (values) => publish.mutate(values),
    (invalid) => {
      const next = tabWithError(invalid);
      if (next) setTab(next);
      toast.error('Some fields need attention before publishing.');
    },
  );

  const tabHasError: Record<string, boolean> = {
    questions: Boolean(errors.fields),
    opening: Boolean(errors.opening),
    followups: Boolean(errors.followUps),
    scoring: Boolean(errors.scoring),
    behaviour: Boolean(
      errors.persona ??
      errors.business ??
      errors.goal ??
      errors.rules ??
      errors.handoff ??
      errors.closing,
    ),
    knowledge: Boolean(errors.knowledgeBase),
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={onPublish} noValidate className="space-y-5 pb-24">
        <div className="flex flex-wrap items-start gap-3">
          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                Live · v{playbook.versionNo}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              What the agent asks, how it talks, and what it knows. Publishing creates a new
              version.
            </p>
          </div>
          <VersionHistory
            canEdit={canEdit}
            onLoad={(config, versionNo) => {
              form.reset(toEditorConfig(config), { keepDefaultValues: true });
              setTab('questions');
              toast.success(`Loaded version ${versionNo}`, {
                description: 'Review it, then publish to make it live again.',
              });
            }}
          />
          {canEdit && <TestChat getConfig={() => form.getValues()} />}
          {canEdit && (
            <TemplatePicker
              onPick={(template) => {
                form.reset(toEditorConfig(template.build(form.getValues('business.name'))), {
                  keepDefaultValues: true,
                });
                setTab('questions');
                toast.success(`Loaded “${template.name}”`, {
                  description: 'Review the questions and wording, then publish to use it.',
                });
              }}
            />
          )}
          {canEdit ? (
            <Button type="submit" disabled={!isDirty || publish.isPending}>
              {publish.isPending ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Upload data-icon="inline-start" />
              )}
              Publish
            </Button>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              <Eye className="size-3.5" />
              View only
            </Badge>
          )}
        </div>

        {banner}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
            {TABS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                {label}
                {value === 'questions' && (
                  <span className="rounded bg-muted px-1 text-[0.65rem] text-muted-foreground tabular-nums">
                    {questionCount}
                  </span>
                )}
                {tabHasError[value] && <span className="size-1.5 rounded-full bg-destructive" />}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="questions" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Asked one at a time, top to bottom, skipping anything the lead already answered.
              Questions with options show WhatsApp buttons or a list; plain questions are typed.
            </p>
            <QuestionsEditor publishedKeys={publishedKeys} readOnly={readOnly} />
          </TabsContent>
          <TabsContent value="opening" className="mt-4">
            <OpeningEditor readOnly={readOnly} dirty={isDirty} />
          </TabsContent>
          <TabsContent value="followups" className="mt-4">
            <FollowUpsEditor readOnly={readOnly} dirty={isDirty} />
          </TabsContent>
          <TabsContent value="scoring" className="mt-4">
            <ScoringEditor readOnly={readOnly} />
          </TabsContent>
          <TabsContent value="behaviour" className="mt-4">
            <BehaviourEditor readOnly={readOnly} />
          </TabsContent>
          <TabsContent value="knowledge" className="mt-4">
            <KnowledgeEditor readOnly={readOnly} />
          </TabsContent>
        </Tabs>

        <AnimatePresence>
          {isDirty && canEdit && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2 }}
              className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur"
            >
              <span className="size-2 rounded-full bg-grade-warm" />
              <span className="flex-1 text-sm">You have unpublished changes.</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => form.reset(defaults)}
                disabled={publish.isPending}
              >
                <RotateCcw data-icon="inline-start" />
                Discard
              </Button>
              <Button type="submit" disabled={publish.isPending}>
                {publish.isPending ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Upload data-icon="inline-start" />
                )}
                Publish v{playbook.versionNo + 1}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </FormProvider>
  );
}

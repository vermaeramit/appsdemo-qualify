import { type ReactNode, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Controller, type FieldError, useFormContext, useWatch } from 'react-hook-form';
import { FormField } from '@/components/form/form-field';
import { StringListInput } from '@/components/form/string-list-input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type EditorConfig, friendlyError } from './form-helpers';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function itemErrors(errors: unknown): (string | undefined)[] | undefined {
  if (!Array.isArray(errors)) return undefined;
  return (errors as (FieldError | undefined)[]).map((error) => friendlyError(error?.message));
}

/** Persona, business, goal, rules, handoff and closing. */
export function BehaviourEditor({ readOnly }: { readOnly: boolean }) {
  const { control, register, formState } = useFormContext<EditorConfig>();
  const { errors } = formState;

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-4">
      <Section
        title="Persona"
        description="Who the leads talk to. The agent introduces itself with this name."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="persona-name"
            label="Agent name"
            error={friendlyError(errors.persona?.name?.message)}
          >
            <Input id="persona-name" placeholder="e.g. Maya" {...register('persona.name')} />
          </FormField>
          <FormField
            id="persona-role"
            label="Role"
            error={friendlyError(errors.persona?.role?.message)}
          >
            <Input
              id="persona-role"
              placeholder="e.g. sales advisor"
              {...register('persona.role')}
            />
          </FormField>
        </div>
        <FormField
          id="persona-tone"
          label="Tone"
          error={friendlyError(errors.persona?.tone?.message)}
        >
          <Textarea id="persona-tone" rows={2} {...register('persona.tone')} />
        </FormField>
        <div className="space-y-1.5">
          <label htmlFor="persona-emoji" className="text-sm font-medium">
            Emoji
          </label>
          <Controller
            control={control}
            name="persona.emoji"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="persona-emoji" className="w-full sm:w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="light">Light (now and then)</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </Section>

      <Section
        title="Business and goal"
        description="What the agent knows about you, and when a lead counts as qualified."
      >
        <FormField
          id="business-name"
          label="Business name"
          error={friendlyError(errors.business?.name?.message)}
          hint="Also fills the business name in the opening message"
        >
          <Input id="business-name" {...register('business.name')} />
        </FormField>
        <FormField
          id="business-description"
          label="About the business"
          error={friendlyError(errors.business?.description?.message)}
        >
          <Textarea id="business-description" rows={3} {...register('business.description')} />
        </FormField>
        <FormField
          id="goal"
          label="Qualification goal"
          error={friendlyError(errors.goal?.message)}
          hint="What 'qualified' means for you"
        >
          <Textarea id="goal" rows={2} {...register('goal')} />
        </FormField>
      </Section>

      <Section
        title="Rules"
        description="Guardrails in plain language, e.g. never confirm prices or availability."
      >
        <Controller
          control={control}
          name="rules"
          render={({ field }) => (
            <StringListInput
              id="rules"
              value={field.value}
              onChange={field.onChange}
              placeholder="e.g. Never promise discounts"
              addLabel="Add rule"
              max={30}
              maxLength={300}
              disabled={readOnly}
              itemErrors={itemErrors(errors.rules)}
            />
          )}
        />
      </Section>

      <Section
        title="Handoff to a human"
        description="When the agent stops and a person takes over (the AI pauses for that lead)."
      >
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Hand off when</span>
          <Controller
            control={control}
            name="handoff.triggers"
            render={({ field }) => (
              <StringListInput
                id="handoff-triggers"
                value={field.value}
                onChange={field.onChange}
                placeholder="e.g. The lead asks to talk to a person"
                addLabel="Add trigger"
                max={10}
                maxLength={200}
                disabled={readOnly}
                itemErrors={itemErrors(errors.handoff?.triggers)}
              />
            )}
          />
        </div>
        <FormField
          id="handoff-message"
          label="Message at handoff"
          error={friendlyError(errors.handoff?.message?.message)}
        >
          <Textarea id="handoff-message" rows={2} {...register('handoff.message')} />
        </FormField>
      </Section>

      <Section title="Closing" description="What happens once all required answers are known.">
        <FormField
          id="closing-message"
          label="Closing message"
          error={friendlyError(errors.closing?.message?.message)}
        >
          <Textarea id="closing-message" rows={2} {...register('closing.message')} />
        </FormField>
        <div className="space-y-1.5">
          <label htmlFor="closing-after" className="text-sm font-medium">
            After qualifying
          </label>
          <Controller
            control={control}
            name="closing.afterQualified"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="closing-after" className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="answer_faqs">Keep answering questions from the KB</SelectItem>
                  <SelectItem value="stop">Stop replying (a person follows up)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </Section>
    </fieldset>
  );
}

const KB_MAX = 40_000;

/** Packages, prices ("starting from"), FAQs and policies the agent may use. */
const KB_FILE_TYPES = '.txt,.md,.markdown,.csv';

/** Reads a text file and returns it as a titled section ready to append to the knowledge base. */
async function readKnowledgeFile(file: File): Promise<string> {
  const text = (await file.text()).replace(/\r\n/g, '\n').trim();
  return `## ${file.name.replace(/\.[^.]+$/, '')}\n\n${text}`;
}

export function KnowledgeEditor({ readOnly }: { readOnly: boolean }) {
  const { register, formState, control, getValues, setValue } = useFormContext<EditorConfig>();
  const length = useWatch({ control, name: 'knowledgeBase' }).length;
  const [fileError, setFileError] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
    setFileError(null);
    if (!files?.length) return;
    const sections = await Promise.all([...files].map(readKnowledgeFile));
    const current = getValues('knowledgeBase').trimEnd();
    const next = [current, ...sections].filter(Boolean).join('\n\n');
    if (next.length > KB_MAX) {
      setFileError(
        `That would make the knowledge base ${next.length.toLocaleString()} characters (limit ${KB_MAX.toLocaleString()}). Shorten the file or remove old text first.`,
      );
      return;
    }
    setValue('knowledgeBase', next, { shouldDirty: true, shouldValidate: true });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge base</CardTitle>
        <CardDescription>
          The agent answers only from this text and never invents prices or availability. Use plain
          text or Markdown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          id="knowledge-base"
          aria-label="Knowledge base"
          rows={22}
          disabled={readOnly}
          className="font-mono text-xs leading-relaxed"
          {...register('knowledgeBase')}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!readOnly ? (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <FileUp className="size-3.5" />
              Add text from a file (.txt, .md, .csv)
              <input
                type="file"
                accept={KB_FILE_TYPES}
                multiple
                className="sr-only"
                aria-label="Add text from a file"
                onChange={(event) => {
                  void addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          ) : (
            <span />
          )}
          <p className="text-xs text-muted-foreground">
            {length.toLocaleString()} / {KB_MAX.toLocaleString()} characters
          </p>
        </div>
        {fileError && <p className="text-xs font-medium text-destructive">{fileError}</p>}
        {formState.errors.knowledgeBase && (
          <p className="text-xs font-medium text-destructive">
            {friendlyError(formState.errors.knowledgeBase.message)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

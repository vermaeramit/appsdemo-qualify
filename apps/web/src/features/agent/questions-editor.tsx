import { useEffect, useRef, useState } from 'react';
import { ListChecks, Plus, ToggleLeft, Type } from 'lucide-react';
import { Reorder } from 'motion/react';
import type { PrefillConfirmation } from '@qualify/shared';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { type AnswerStyle, type EditorConfig, newQuestion } from './form-helpers';
import { QuestionCard, type QuestionRow } from './question-card';

const MAX_QUESTIONS = 20;

const ADD_OPTIONS: { style: AnswerStyle; label: string; hint: string; icon: typeof Type }[] = [
  {
    style: 'options',
    label: 'Question with options',
    hint: 'Buttons or a list menu',
    icon: ListChecks,
  },
  { style: 'yes_no', label: 'Yes / No question', hint: 'Two buttons', icon: ToggleLeft },
  { style: 'plain', label: 'Plain question', hint: 'The lead types the answer', icon: Type },
];

const CONFIRM_MODES: { value: PrefillConfirmation; label: string; example: string }[] = [
  {
    value: 'together',
    label: 'Confirm together',
    example: '“You mentioned Goa in December for 4 people. Is that right?”',
  },
  {
    value: 'one_by_one',
    label: 'Confirm one by one',
    example: '“You’re planning Goa, right?” then the next answer',
  },
  { value: 'off', label: "Don't confirm", example: 'Form answers are used as they are' },
];

/** How the agent checks answers that came with the lead (D-089). */
function PrefillConfirmationSetting({ readOnly }: { readOnly: boolean }) {
  const { control } = useFormContext<EditorConfig>();
  const mode = useWatch({ control, name: 'prefillConfirmation' });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card p-3">
      <div className="min-w-0 flex-1 basis-64">
        <Label htmlFor="prefill-confirmation" className="text-sm font-medium">
          Answers from forms
        </Label>
        <p className="text-xs text-muted-foreground">
          When a lead form or your website already answered a question, the agent first checks it
          with the lead. {CONFIRM_MODES.find((option) => option.value === mode)?.example}
        </p>
      </div>
      <Controller
        control={control}
        name="prefillConfirmation"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
            <SelectTrigger id="prefill-confirmation" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONFIRM_MODES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

/** The questions the agent asks, in order. Drag (or use the menu) to change the order. */
export function QuestionsEditor({
  publishedKeys,
  readOnly,
}: {
  publishedKeys: ReadonlySet<string>;
  readOnly: boolean;
}) {
  const { control, getValues } = useFormContext<EditorConfig>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'fields' });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const expandAdded = useRef(false);
  const lastId = fields.at(-1)?.id;

  // Open a question right after it is added.
  useEffect(() => {
    if (!expandAdded.current || !lastId) return;
    expandAdded.current = false;
    setExpanded((current) => new Set(current).add(lastId));
  }, [lastId]);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Reorder reports the new order one step at a time; apply it as a single move.
  const onReorder = (next: QuestionRow[]) => {
    const from = next.findIndex((row, index) => row.id !== fields[index]?.id);
    if (from === -1) return;
    const moved = fields.findIndex((row) => row.id === next[from]!.id);
    move(moved, from);
  };

  const otherKeys = (index: number) => () =>
    new Set(
      getValues('fields')
        .filter((_, i) => i !== index)
        .map((field) => field.key),
    );

  const add = (style: AnswerStyle) => {
    expandAdded.current = true;
    append(newQuestion(style, new Set(getValues('fields').map((field) => field.key))), {
      shouldFocus: false,
    });
  };

  return (
    <div className="space-y-3">
      <PrefillConfirmationSetting readOnly={readOnly} />
      <Reorder.Group axis="y" values={fields} onReorder={onReorder} className="space-y-2">
        {fields.map((row, index) => (
          <QuestionCard
            key={row.id}
            row={row}
            index={index}
            count={fields.length}
            isNew={!publishedKeys.has(row.key)}
            expanded={expanded.has(row.id)}
            readOnly={readOnly}
            otherKeys={otherKeys(index)}
            onToggle={() => toggle(row.id)}
            onMove={(to) => move(index, to)}
            onRemove={() => remove(index)}
          />
        ))}
      </Reorder.Group>

      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full" disabled={fields.length >= MAX_QUESTIONS}>
              <Plus data-icon="inline-start" />
              {fields.length >= MAX_QUESTIONS ? 'Maximum 20 questions' : 'Add question'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="center">
            <DropdownMenuLabel>How will the lead answer?</DropdownMenuLabel>
            {ADD_OPTIONS.map(({ style, label, hint, icon: Icon }) => (
              <DropdownMenuItem key={style} onSelect={() => add(style)}>
                <Icon />
                <span className="flex flex-col">
                  <span>{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

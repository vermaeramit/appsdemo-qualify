import { useState } from 'react';
import type { FieldType } from '@qualify/shared';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  EllipsisVertical,
  GripVertical,
  ListChecks,
  ToggleLeft,
  Trash2,
  Type,
} from 'lucide-react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { FormField } from '@/components/form/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  type AnswerStyle,
  answerStyleOf,
  type EditorConfig,
  friendlyError,
  keyFromLabel,
  PLAIN_TYPES,
} from './form-helpers';
import { OptionsInput } from './options-input';
import { QuestionPreview } from './whatsapp-preview';

export interface QuestionRow {
  id: string;
}

interface QuestionCardProps {
  row: QuestionRow;
  index: number;
  count: number;
  /** Not published yet: its key still follows the label. */
  isNew: boolean;
  expanded: boolean;
  readOnly: boolean;
  otherKeys: () => Set<string>;
  onToggle: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}

const STYLES: { value: AnswerStyle; label: string; icon: typeof ListChecks }[] = [
  { value: 'options', label: 'With options', icon: ListChecks },
  { value: 'yes_no', label: 'Yes / No', icon: ToggleLeft },
  { value: 'plain', label: 'Plain answer', icon: Type },
];

function styleBadge(type: FieldType, optionCount: number): string {
  if (type === 'choice') return `Options · ${optionCount}`;
  if (type === 'yes_no') return 'Yes / No';
  return `Plain · ${PLAIN_TYPES.find((plain) => plain.value === type)?.label ?? type}`;
}

/** One question: collapsed header (drag to reorder) and an expandable editor with a preview. */
export function QuestionCard(props: QuestionCardProps) {
  const { row, index, count, isNew, expanded, readOnly } = props;
  const controls = useDragControls();
  const { control, register, setValue, formState } = useFormContext<EditorConfig>();
  const field = useWatch({ control, name: `fields.${index}` });
  const errors = formState.errors.fields?.[index];
  const hasError = Boolean(errors);
  const [keyEdited, setKeyEdited] = useState(false);
  const path = `fields.${index}` as const;
  const requiredValue = field.required;
  const style = answerStyleOf(field.type);

  const changeStyle = (next: AnswerStyle) => {
    if (next === style) return;
    const type: FieldType = next === 'options' ? 'choice' : next === 'yes_no' ? 'yes_no' : 'text';
    setValue(`${path}.type`, type, { shouldDirty: true });
    if (next === 'options' && !field.options) {
      setValue(`${path}.options`, [], { shouldDirty: true });
    }
  };

  const labelField = register(`${path}.label`);

  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      className="list-none"
      transition={{ duration: 0.2 }}
    >
      <div
        className={cn(
          'rounded-xl border bg-card shadow-xs transition-colors',
          expanded && 'ring-1 ring-primary/25',
          hasError && 'border-destructive/50',
        )}
      >
        <div className="flex items-center gap-2 px-2 py-2 sm:px-3">
          {!readOnly && (
            <button
              type="button"
              className="hidden cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing sm:block"
              onPointerDown={(event) => controls.start(event)}
              aria-label="Drag to reorder"
            >
              <GripVertical className="size-4" />
            </button>
          )}
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
            {index + 1}
          </span>
          <button
            type="button"
            onClick={props.onToggle}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-expanded={expanded}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate text-sm font-medium',
                  !field.label && 'text-muted-foreground',
                )}
              >
                {field.label || 'Untitled question'}
              </span>
              {field.question && (
                <span className="block truncate text-xs text-muted-foreground">
                  {field.question}
                </span>
              )}
            </span>
            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
              {styleBadge(field.type, field.options?.length ?? 0)}
            </Badge>
            {field.required && (
              <Badge variant="outline" className="shrink-0 border-primary/30 text-primary">
                Required
              </Badge>
            )}
            {hasError && <span className="size-2 shrink-0 rounded-full bg-destructive" />}
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </button>
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Question actions">
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={index === 0} onSelect={() => props.onMove(index - 1)}>
                  <ArrowUp />
                  Ask earlier
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={index === count - 1}
                  onSelect={() => props.onMove(index + 1)}
                >
                  <ArrowDown />
                  Ask later
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={count <= 1}
                  onSelect={props.onRemove}
                >
                  <Trash2 />
                  Delete question
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid gap-5 border-t p-4 md:grid-cols-[1fr_260px]">
                <fieldset disabled={readOnly} className="min-w-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      id={`${row.id}-label`}
                      label="What you collect"
                      error={friendlyError(errors?.label?.message)}
                      hint="Shown in the lead panel and exports"
                    >
                      <Input
                        id={`${row.id}-label`}
                        placeholder="e.g. Preferred plan"
                        aria-invalid={Boolean(errors?.label)}
                        {...labelField}
                        onChange={(event) => {
                          void labelField.onChange(event);
                          if (isNew && !keyEdited) {
                            setValue(
                              `${path}.key`,
                              keyFromLabel(event.target.value, props.otherKeys()),
                            );
                          }
                        }}
                      />
                    </FormField>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${row.id}-required`}>Required</Label>
                      <div className="flex h-9 items-center gap-2.5">
                        <Controller
                          control={control}
                          name={`${path}.required`}
                          render={({ field: input }) => (
                            <Switch
                              id={`${row.id}-required`}
                              checked={input.value}
                              onCheckedChange={input.onChange}
                            />
                          )}
                        />
                        <span className="text-xs text-muted-foreground">
                          A lead is qualified only when every required answer is known
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3">
                    <Controller
                      control={control}
                      name={`${path}.confirmWhenPrefilled`}
                      render={({ field: input }) => (
                        <Switch
                          id={`${row.id}-confirm`}
                          className="mt-0.5"
                          // Unset follows "Required" (D-089).
                          checked={input.value ?? requiredValue}
                          onCheckedChange={input.onChange}
                        />
                      )}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor={`${row.id}-confirm`} className="font-normal">
                        Confirm when it comes from a form
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        If a lead form or your website already gave this answer, the agent checks it
                        with the lead before relying on it.
                      </p>
                    </div>
                  </div>

                  <FormField
                    id={`${row.id}-question`}
                    label="How the agent asks"
                    error={friendlyError(errors?.question?.message)}
                    hint="The agent keeps the meaning and replies in the lead's language"
                  >
                    <Textarea
                      id={`${row.id}-question`}
                      rows={2}
                      placeholder="e.g. Which plan are you interested in?"
                      {...register(`${path}.question`)}
                    />
                  </FormField>

                  <div className="space-y-2">
                    <Label>How the lead answers</Label>
                    <div
                      role="radiogroup"
                      aria-label="How the lead answers"
                      className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
                    >
                      {STYLES.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={style === value}
                          onClick={() => changeStyle(value)}
                          className={cn(
                            'relative flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                            style === value
                              ? 'text-foreground'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {style === value && (
                            <motion.span
                              layoutId={`${row.id}-style`}
                              className="absolute inset-0 rounded-md bg-background shadow-sm"
                              transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                            />
                          )}
                          <Icon className="relative size-4" />
                          <span className="relative">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {style === 'options' && (
                    <div className="space-y-3">
                      <FormField
                        id={`${row.id}-options`}
                        label="Options"
                        error={friendlyError(
                          errors?.options?.message ??
                            errors?.options?.root?.message ??
                            (Array.isArray(errors?.options)
                              ? errors.options.find(Boolean)?.message
                              : undefined),
                        )}
                        hint="2–10 options, up to 24 characters each"
                      >
                        <Controller
                          control={control}
                          name={`${path}.options`}
                          render={({ field: input }) => (
                            <OptionsInput
                              id={`${row.id}-options`}
                              value={input.value ?? []}
                              onChange={input.onChange}
                              disabled={readOnly}
                              invalid={Boolean(errors?.options)}
                            />
                          )}
                        />
                      </FormField>
                      <div className="flex items-center gap-2.5">
                        <Controller
                          control={control}
                          name={`${path}.allowOther`}
                          render={({ field: input }) => (
                            <Switch
                              id={`${row.id}-other`}
                              checked={Boolean(input.value)}
                              onCheckedChange={input.onChange}
                            />
                          )}
                        />
                        <Label htmlFor={`${row.id}-other`} className="font-normal">
                          The lead may also type an answer that is not in the list
                        </Label>
                      </div>
                    </div>
                  )}

                  {style === 'plain' && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`${row.id}-type`}>Kind of answer</Label>
                      <Controller
                        control={control}
                        name={`${path}.type`}
                        render={({ field: input }) => (
                          <Select value={input.value} onValueChange={input.onChange}>
                            <SelectTrigger id={`${row.id}-type`} className="w-full sm:w-72">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PLAIN_TYPES.map((plain) => (
                                <SelectItem key={plain.value} value={plain.value}>
                                  {plain.label}
                                  <span className="text-muted-foreground">· {plain.hint}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  )}

                  <details className="group rounded-lg border px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground select-none group-open:mb-3">
                      Advanced
                    </summary>
                    <div className="space-y-4">
                      <FormField
                        id={`${row.id}-guidance`}
                        label="How to read answers (optional)"
                        error={friendlyError(errors?.guidance?.message)}
                        hint='e.g. "Convert lakhs to rupees." or "Ask for the model if they know it."'
                      >
                        <Textarea
                          id={`${row.id}-guidance`}
                          rows={2}
                          {...register(`${path}.guidance`)}
                        />
                      </FormField>
                      <FormField
                        id={`${row.id}-key`}
                        label="Key"
                        error={friendlyError(errors?.key?.message)}
                        hint={
                          isNew
                            ? 'Used in the API and exports. Follows the name until you edit it.'
                            : 'Fixed after publishing, because saved answers use it.'
                        }
                      >
                        <Input
                          id={`${row.id}-key`}
                          className="font-mono text-xs"
                          readOnly={!isNew}
                          {...register(`${path}.key`, { onChange: () => setKeyEdited(true) })}
                        />
                      </FormField>
                    </div>
                  </details>
                </fieldset>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">WhatsApp preview</p>
                  <QuestionPreview field={field} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reorder.Item>
  );
}

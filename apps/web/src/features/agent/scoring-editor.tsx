import { maxRulePoints } from '@qualify/core';
import type { PlaybookField, ScoringRule } from '@qualify/shared';
import { Plus, Trash2, X } from 'lucide-react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type EditorConfig } from './form-helpers';

const MONTH_LABELS = ['Within 1 month', 'Within 3 months', 'Within 6 months', 'Later or flexible'];

/** A starting rule for a question, by its type. */
function newRule(field: PlaybookField): ScoringRule {
  switch (field.type) {
    case 'choice':
      return {
        field: field.key,
        options: Object.fromEntries((field.options ?? []).map((option) => [option, 0])),
      };
    case 'yes_no':
      return { field: field.key, options: { yes: 10, no: 0 } };
    case 'date_month':
      return { field: field.key, months: [25, 18, 10, 3] };
    case 'number':
    case 'range':
      return { field: field.key, amounts: [{ min: 0, points: 5 }] };
    case 'text':
      return { field: field.key, points: 5 };
  }
}

function PointsInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Input
      type="number"
      min={0}
      max={100}
      step={1}
      className="h-8 w-20"
      aria-label={label}
      value={Number.isFinite(value) ? value : ''}
      disabled={disabled}
      onChange={(event) => onChange(Math.round(Number(event.target.value)))}
    />
  );
}

/** Points per answer (by question type), grade thresholds and the AI intent weight. */
export function ScoringEditor({ readOnly }: { readOnly: boolean }) {
  const { control, register, formState } = useFormContext<EditorConfig>();
  const { fields: rules, append, remove } = useFieldArray({ control, name: 'scoring.rules' });
  const scoring = useWatch({ control, name: 'scoring' });
  const questions = useWatch({ control, name: 'fields' });
  const errors = formState.errors.scoring;
  const byKey = new Map(questions.map((field) => [field.key, field]));
  const unused = questions.filter(
    (field) => !scoring.rules.some((rule) => rule.field === field.key),
  );
  const ruleMax = maxRulePoints(scoring);
  const total = ruleMax + (Number(scoring.aiMaxPoints) || 0);

  return (
    <fieldset disabled={readOnly} className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Grades</CardTitle>
          <CardDescription>
            Score = points from the answers + AI intent (urgency, seriousness and buying signals the
            AI reads from the chat). Scores above 100 are capped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="font-medium text-grade-hot">Hot</span> from
              <Input
                type="number"
                min={1}
                max={100}
                className="h-8 w-20"
                aria-invalid={Boolean(errors?.hotAt)}
                {...register('scoring.hotAt', { valueAsNumber: true })}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="font-medium text-grade-warm">Warm</span> from
              <Input
                type="number"
                min={0}
                max={99}
                className="h-8 w-20"
                aria-invalid={Boolean(errors?.warmAt)}
                {...register('scoring.warmAt', { valueAsNumber: true })}
              />
            </label>
            <span className="text-muted-foreground">
              Below that: <span className="font-medium text-grade-cold">Cold</span>. “Not a fit”
              when the AI disqualifies the lead.
            </span>
          </div>
          {errors?.hotAt && (
            <p className="text-xs text-destructive">{errors.hotAt.message ?? 'Check the values'}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <label className="flex items-center gap-2">
              AI intent, up to
              <Input
                type="number"
                min={0}
                max={100}
                className="h-8 w-20"
                {...register('scoring.aiMaxPoints', { valueAsNumber: true })}
              />
              points
            </label>
            <label className="flex items-center gap-2">
              All required answers given
              <Input
                type="number"
                min={0}
                max={100}
                className="h-8 w-20"
                {...register('scoring.completePoints', { valueAsNumber: true })}
              />
              points
            </label>
          </div>
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Highest possible: {ruleMax} from answers + {Number(scoring.aiMaxPoints) || 0} from AI ={' '}
            <span className="font-medium text-foreground">{total}</span>
            {total < Number(scoring.hotAt) && ' (lower than Hot: no lead can become Hot)'}.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Points per answer</CardTitle>
          <CardDescription>
            Choose which answers matter and how much. Questions without a rule add no points.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rules.map((row, index) => {
            const rule = scoring.rules[index];
            const field = rule ? byKey.get(rule.field) : undefined;
            return (
              <div key={row.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium">
                    {field?.label ?? rule?.field ?? 'Removed question'}
                  </span>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      aria-label={`Remove the rule for ${field?.label ?? 'this question'}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                {!field ? (
                  <p className="text-xs text-muted-foreground">
                    This question no longer exists. Remove the rule.
                  </p>
                ) : (
                  <RuleEditor index={index} field={field} readOnly={readOnly} />
                )}
              </div>
            );
          })}
          {rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rules: the score comes from completeness and AI intent.
            </p>
          )}
          {!readOnly && unused.length > 0 && rules.length < 20 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Plus data-icon="inline-start" />
                  Add a rule
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {unused.map((field) => (
                  <DropdownMenuItem key={field.key} onSelect={() => append(newRule(field))}>
                    {field.label || field.key}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardContent>
      </Card>
    </fieldset>
  );
}

/** The inputs for one rule, shaped by the question's type. */
function RuleEditor({
  index,
  field,
  readOnly,
}: {
  index: number;
  field: PlaybookField;
  readOnly: boolean;
}) {
  const { control } = useFormContext<EditorConfig>();
  const questions = useWatch({ control, name: 'fields' });

  if (field.type === 'choice' || field.type === 'yes_no') {
    const keys = field.type === 'yes_no' ? ['yes', 'no'] : (field.options ?? []);
    return (
      <Controller
        control={control}
        name={`scoring.rules.${index}.options`}
        render={({ field: input }) => (
          <div className="grid max-w-2xl gap-x-8 gap-y-2 sm:grid-cols-2">
            {keys.map((key) => (
              <label key={key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {field.type === 'yes_no' ? (key === 'yes' ? 'Yes' : 'No') : key}
                </span>
                <PointsInput
                  label={`Points for ${key}`}
                  value={input.value?.[key] ?? 0}
                  disabled={readOnly}
                  onChange={(value) => input.onChange({ ...input.value, [key]: value })}
                />
              </label>
            ))}
          </div>
        )}
      />
    );
  }

  if (field.type === 'date_month') {
    return (
      <Controller
        control={control}
        name={`scoring.rules.${index}.months`}
        render={({ field: input }) => {
          const months = input.value ?? [0, 0, 0, 0];
          return (
            <div className="grid max-w-2xl gap-x-8 gap-y-2 sm:grid-cols-2">
              {MONTH_LABELS.map((label, band) => (
                <label key={label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <PointsInput
                    label={`Points for ${label}`}
                    value={months[band] ?? 0}
                    disabled={readOnly}
                    onChange={(value) => {
                      const next = [...months] as [number, number, number, number];
                      next[band] = value;
                      input.onChange(next);
                    }}
                  />
                </label>
              ))}
            </div>
          );
        }}
      />
    );
  }

  if (field.type === 'number' || field.type === 'range') {
    return (
      <div className="space-y-3">
        <Controller
          control={control}
          name={`scoring.rules.${index}.amounts`}
          render={({ field: input }) => {
            const bands = input.value ?? [];
            const update = (next: typeof bands) => input.onChange(next);
            return (
              <div className="space-y-2">
                {bands.map((band, position) => (
                  <div key={position} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Amount at least</span>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-28"
                      aria-label={`Minimum amount for band ${position + 1}`}
                      value={band.min}
                      disabled={readOnly}
                      onChange={(event) =>
                        update(
                          bands.map((entry, i) =>
                            i === position
                              ? { ...entry, min: Math.max(0, Number(event.target.value)) }
                              : entry,
                          ),
                        )
                      }
                    />
                    <span className="text-muted-foreground">→</span>
                    <PointsInput
                      label={`Points for band ${position + 1}`}
                      value={band.points}
                      disabled={readOnly}
                      onChange={(value) =>
                        update(
                          bands.map((entry, i) =>
                            i === position ? { ...entry, points: value } : entry,
                          ),
                        )
                      }
                    />
                    <span className="text-muted-foreground">points</span>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove band ${position + 1}`}
                        onClick={() => update(bands.filter((_, i) => i !== position))}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && bands.length < 6 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update([...bands, { min: 0, points: 0 }])}
                  >
                    <Plus data-icon="inline-start" />
                    Add band
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  The highest band the amount reaches counts. For a range like 50,000–80,000 the
                  lower end is used.
                </p>
              </div>
            );
          }}
        />
        <Controller
          control={control}
          name={`scoring.rules.${index}.perPersonField`}
          render={({ field: input }) => (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                For “total” amounts, divide by people in
              </span>
              <Select
                value={input.value ?? '__none'}
                disabled={readOnly}
                onValueChange={(value) => input.onChange(value === '__none' ? undefined : value)}
              >
                <SelectTrigger className="h-8 w-48" aria-label="Question with the number of people">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Don’t divide</SelectItem>
                  {questions
                    .filter((question) => question.key !== field.key)
                    .map((question) => (
                      <SelectItem key={question.key} value={question.key}>
                        {question.label || question.key}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
        />
      </div>
    );
  }

  return (
    <Controller
      control={control}
      name={`scoring.rules.${index}.points`}
      render={({ field: input }) => (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">When answered</span>
          <PointsInput
            label={`Points when ${field.label} is answered`}
            value={input.value ?? 0}
            disabled={readOnly}
            onChange={input.onChange}
          />
          <span className="text-muted-foreground">points</span>
        </label>
      )}
    />
  );
}

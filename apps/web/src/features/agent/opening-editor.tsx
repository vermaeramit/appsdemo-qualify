import { useRef } from 'react';
import { renderOpening } from '@qualify/core';
import { Lock, TriangleAlert } from 'lucide-react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { FormField } from '@/components/form/form-field';
import { StringListInput } from '@/components/form/string-list-input';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type EditorConfig, friendlyError, placeholderCount } from './form-helpers';
import { type TemplateKind, TemplateStatusCard } from './template-status-card';
import { WhatsAppBubble } from './whatsapp-preview';

const LEAD_SOURCES = [
  { value: 'lead.firstName', label: 'Lead’s first name' },
  { value: 'lead.name', label: 'Lead’s full name' },
  { value: 'business.name', label: 'Business name' },
] as const;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'hi', label: 'Hindi' },
];

/** Problems Meta reviewers reject templates for, caught before submitting. */
function templateWarnings(text: string): string[] {
  const warnings: string[] = [];
  const trimmed = text.trim();
  if (/^\{\{\d+\}\}/.test(trimmed) || /\{\{\d+\}\}[.!?]?$/.test(trimmed)) {
    warnings.push('Meta rejects templates that start or end with a variable.');
  }
  const numbers = [...trimmed.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  if (unique.some((number, index) => number !== index + 1)) {
    warnings.push('Number the variables in order: {{1}}, {{2}}, {{3}}…');
  }
  return warnings;
}

/** Where a template-backed message lives in the editor form. */
type MessageBase = 'opening' | 'followUps.template';

interface TemplateMessageEditorProps {
  base: MessageBase;
  kind: TemplateKind;
  title: string;
  description: string;
  readOnly: boolean;
  dirty: boolean;
}

/**
 * A business-initiated message (opening or follow-up). Outside WhatsApp's 24-hour window it
 * must be an approved template, so an approved text is locked until you choose to change it.
 */
export function TemplateMessageEditor({
  base,
  kind,
  title,
  description,
  readOnly,
  dirty,
}: TemplateMessageEditorProps) {
  const { control, register, setValue, getValues, formState } = useFormContext<EditorConfig>();
  const message = useWatch({ control, name: base });
  const fields = useWatch({ control, name: 'fields' });
  const businessName = useWatch({ control, name: 'business.name' });
  const errors =
    base === 'opening' ? formState.errors.opening : formState.errors.followUps?.template;
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const locked = message.templateName !== null;
  const count = placeholderCount(message.bodyText);
  const bodyField = register(`${base}.bodyText`);

  const setParam = (index: number, spec: string) => {
    const params = [...getValues(`${base}.bodyParams`)];
    while (params.length <= index) params.push('lead.firstName');
    params[index] = spec;
    setValue(`${base}.bodyParams`, params, { shouldDirty: true });
  };

  const insertVariable = (spec: string) => {
    const next = count + 1;
    const token = `{{${next}}}`;
    const element = textRef.current;
    const text = getValues(`${base}.bodyText`);
    const start = element?.selectionStart ?? text.length;
    const end = element?.selectionEnd ?? text.length;
    setValue(`${base}.bodyText`, text.slice(0, start) + token + text.slice(end), {
      shouldDirty: true,
      shouldValidate: formState.isSubmitted,
    });
    setParam(next - 1, spec);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const preview = renderOpening(
    { ...message, bodyParams: message.bodyParams.slice(0, count) },
    {
      leadName: 'Rahul Sharma',
      fields: Object.fromEntries(fields.map((field) => [field.key, field.label || field.key])),
      businessName: businessName || 'your business',
    },
  );
  const warnings = templateWarnings(message.bodyText);
  const editable = !readOnly && !locked;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {locked && (
              <div className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success/8 p-3 text-sm sm:flex-row sm:items-center">
                <Lock className="size-4 shrink-0 text-success" />
                <p className="flex-1">
                  This text is an approved template (
                  <span className="font-mono text-xs">{message.templateName}</span>). Changing it
                  needs a new approval from Meta.
                </p>
                {!readOnly && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="outline" size="sm">
                        Change text
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Change the approved text?</AlertDialogTitle>
                        <AlertDialogDescription>
                          After you publish, leads who haven’t messaged you in the last 24 hours
                          can’t be contacted until the new text is approved by Meta.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep the approved text</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            setValue(`${base}.templateName`, null, { shouldDirty: true })
                          }
                        >
                          Change text
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}

            <FormField
              id={`${kind}-text`}
              label="Message"
              error={friendlyError(errors?.bodyText?.message)}
              hint="Variables like {{1}} are filled for each lead"
            >
              <Textarea
                id={`${kind}-text`}
                rows={4}
                readOnly={!editable}
                {...bodyField}
                ref={(element) => {
                  bodyField.ref(element);
                  textRef.current = element;
                }}
              />
            </FormField>

            {editable && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">Insert:</span>
                {LEAD_SOURCES.map((source) => (
                  <Button
                    key={source.value}
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={count >= 10}
                    onClick={() => insertVariable(source.value)}
                  >
                    {source.label}
                  </Button>
                ))}
              </div>
            )}

            {warnings.length > 0 && editable && (
              <ul className="space-y-1 rounded-lg border border-grade-warm/40 bg-grade-warm/8 p-3 text-xs">
                {warnings.map((warning) => (
                  <li key={warning} className="flex gap-2">
                    <TriangleAlert className="size-3.5 shrink-0 text-grade-warm" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            {count > 0 && (
              <div className="space-y-2">
                <Label>Variables</Label>
                <div className="space-y-2">
                  {Array.from({ length: count }, (_, index) => {
                    const spec = message.bodyParams[index] ?? 'lead.firstName';
                    const [source = 'lead.firstName', fallback = ''] = spec.split('|');
                    const isField = source.startsWith('field:');
                    return (
                      <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                          {`{{${index + 1}}}`}
                        </span>
                        <Select
                          value={source}
                          disabled={!editable}
                          onValueChange={(value) => setParam(index, value)}
                        >
                          <SelectTrigger
                            className="w-full sm:w-64"
                            aria-label={`Variable ${index + 1}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_SOURCES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                            <SelectGroup>
                              <SelectLabel>Answer the lead already gave</SelectLabel>
                              {fields.map((field) => (
                                <SelectItem key={field.key} value={`field:${field.key}`}>
                                  {field.label || field.key}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {isField && (
                          <Input
                            className="sm:w-48"
                            placeholder="If unknown, use…"
                            aria-label={`Fallback for variable ${index + 1}`}
                            value={fallback}
                            readOnly={!editable}
                            onChange={(event) => {
                              const text = event.target.value.replace(/\|/g, '');
                              setParam(index, text ? `${source}|${text}` : source);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-buttons`}>Reply buttons</Label>
              <Controller
                control={control}
                name={`${base}.buttons`}
                render={({ field }) => (
                  <StringListInput
                    id={`${kind}-buttons`}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g. Yes, sure"
                    addLabel="Add button"
                    max={3}
                    maxLength={20}
                    disabled={!editable}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">Up to 3 buttons, 20 characters each.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-language`}>Template language</Label>
              <Controller
                control={control}
                name={`${base}.templateLanguage`}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!editable}>
                    <SelectTrigger id={`${kind}-language`} className="w-full sm:w-60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((language) => (
                        <SelectItem key={language.value} value={language.value}>
                          {language.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Preview</CardTitle>
            <CardDescription>For a lead named Rahul Sharma.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted/60 p-3">
              <WhatsAppBubble buttons={message.buttons.filter((button) => button.trim())}>
                {preview.text}
              </WhatsAppBubble>
            </div>
          </CardContent>
        </Card>
        <TemplateStatusCard kind={kind} readOnly={readOnly} dirty={dirty} />
      </div>
    </div>
  );
}

/** The first message to a lead from a form or the API. */
export function OpeningEditor({ readOnly, dirty }: { readOnly: boolean; dirty: boolean }) {
  return (
    <TemplateMessageEditor
      base="opening"
      kind="opening"
      title="Opening message"
      description="Sent first to leads from forms and the API. Inside the 24-hour window it goes as normal text with buttons; outside it, WhatsApp only allows the approved template."
      readOnly={readOnly}
      dirty={dirty}
    />
  );
}

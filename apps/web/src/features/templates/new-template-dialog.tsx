import { useState } from 'react';
import {
  type CreateTemplateRequest,
  createTemplateRequestSchema,
  TEMPLATE_LANGUAGES,
  type TemplateHeaderMedia,
  templateVariables,
} from '@qualify/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Braces, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { StringListInput } from '@/components/form/string-list-input';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { HeaderMediaInput } from '@/features/media/header-media-input';
import { apiSend, errorMessage } from '@/lib/api';
import { TemplatePreview } from './template-preview';

const createdSchema = z.object({ id: z.string(), status: z.string(), category: z.string() });

/** "Visit Reminder" → "visit_reminder" (Meta's naming rule). */
const toName = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 512);

/** Write a new template, preview it, and submit it to Meta for review (owners, managers). */
export function NewTemplateDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<CreateTemplateRequest['language']>('en');
  const [category, setCategory] = useState<CreateTemplateRequest['category']>('MARKETING');
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'media'>('none');
  const [headerText, setHeaderText] = useState('');
  const [headerMedia, setHeaderMedia] = useState<TemplateHeaderMedia | undefined>(undefined);
  const [bodyText, setBodyText] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const variableCount = new Set(templateVariables(bodyText)).size;
  const exampleValues = Array.from({ length: variableCount }, (_, index) => examples[index] ?? '');

  const reset = () => {
    setName('');
    setHeaderType('none');
    setHeaderText('');
    setHeaderMedia(undefined);
    setBodyText('');
    setExamples([]);
    setFooterText('');
    setButtons([]);
    setErrors({});
  };

  const submit = useMutation({
    mutationFn: (value: CreateTemplateRequest) =>
      apiSend('POST', '/api/templates', value, createdSchema),
    onSuccess: async (created, value) => {
      toast.success(`Submitted “${value.name}” to Meta`, {
        description: `Status: ${created.status.toLowerCase()}. Review usually takes minutes, sometimes up to a day.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      reset();
      setOpen(false);
    },
  });

  const onSubmit = () => {
    const parsed = createTemplateRequestSchema.safeParse({
      name,
      language,
      category,
      headerText: headerType === 'text' ? headerText.trim() || undefined : undefined,
      headerMedia: headerType === 'media' ? headerMedia : undefined,
      bodyText,
      examples: exampleValues,
      footerText: footerText.trim() || undefined,
      buttons: buttons.map((button) => button.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message]),
        ),
      );
      return;
    }
    setErrors({});
    submit.mutate(parsed.data);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) submit.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          New template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New message template</DialogTitle>
          <DialogDescription>
            Templates are the only messages you can send to a lead who hasn&apos;t written in the
            last 24 hours. Meta reviews each one before it can be used.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_17rem]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
              <div className="space-y-1.5">
                <Label htmlFor="template-name">Name</Label>
                <Input
                  id="template-name"
                  placeholder="visit_reminder"
                  value={name}
                  onChange={(event) => setName(toName(event.target.value))}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-language">Language</Label>
                <Select
                  value={language}
                  onValueChange={(value) => setLanguage(value as typeof language)}
                >
                  <SelectTrigger id="template-language" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TEMPLATE_LANGUAGES).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-category">Category</Label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as typeof category)}
                >
                  <SelectTrigger id="template-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utility</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Marketing: offers, follow-ups, re-engagement. Utility: updates about something the
              lead asked for (bookings, appointments). Meta may change the category on review.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="template-header-type">Header (optional)</Label>
              <Select
                value={headerType}
                onValueChange={(value) => setHeaderType(value as typeof headerType)}
              >
                <SelectTrigger id="template-header-type" className="w-full sm:w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No header</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="media">Image, video or PDF</SelectItem>
                </SelectContent>
              </Select>
              {headerType === 'text' && (
                <Input
                  aria-label="Header text"
                  maxLength={60}
                  value={headerText}
                  onChange={(event) => setHeaderText(event.target.value)}
                />
              )}
              {headerType === 'media' && (
                <HeaderMediaInput
                  id="template-header-media"
                  value={headerMedia}
                  onChange={setHeaderMedia}
                />
              )}
              {errors.headerText && <p className="text-xs text-destructive">{errors.headerText}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-body">Message</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setBodyText((text) => `${text}{{${variableCount + 1}}}`)}
                >
                  <Braces data-icon="inline-start" />
                  Add variable
                </Button>
              </div>
              <Textarea
                id="template-body"
                rows={5}
                maxLength={1024}
                placeholder="Hi {{1}}, thanks for your interest. Can we help you with anything else?"
                value={bodyText}
                onChange={(event) => setBodyText(event.target.value)}
              />
              {errors.bodyText && <p className="text-xs text-destructive">{errors.bodyText}</p>}
            </div>

            {variableCount > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Example values (Meta reviews with these)</p>
                {exampleValues.map((value, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-10 font-mono text-xs text-muted-foreground">{`{{${index + 1}}}`}</span>
                    <Input
                      aria-label={`Example for variable ${index + 1}`}
                      value={value}
                      maxLength={200}
                      onChange={(event) =>
                        setExamples((current) => {
                          const next = [...current];
                          next[index] = event.target.value;
                          return next;
                        })
                      }
                    />
                  </div>
                ))}
                {errors.examples && <p className="text-xs text-destructive">{errors.examples}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="template-footer">Footer (optional)</Label>
              <Input
                id="template-footer"
                maxLength={60}
                placeholder="Reply STOP to stop messages"
                value={footerText}
                onChange={(event) => setFooterText(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-buttons">Quick reply buttons (optional)</Label>
              <StringListInput
                id="template-buttons"
                value={buttons}
                onChange={setButtons}
                placeholder="e.g. Yes, call me"
                addLabel="Add button"
                max={10}
                maxLength={25}
              />
              {errors.buttons && <p className="text-xs text-destructive">{errors.buttons}</p>}
            </div>

            {submit.isError && (
              <p className="text-sm text-destructive">
                {errorMessage(submit.error, 'Could not submit the template.')}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <div className="rounded-xl bg-muted/50 p-3">
              <TemplatePreview
                headerText={headerType === 'text' ? headerText : undefined}
                headerMedia={headerType === 'media' ? headerMedia : undefined}
                bodyText={bodyText}
                footerText={footerText}
                buttons={buttons}
                examples={exampleValues}
              />
            </div>
            <Button
              className="w-full"
              disabled={submit.isPending || (headerType === 'media' && !headerMedia)}
              onClick={onSubmit}
            >
              {submit.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Submit to Meta
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { z } from 'zod';
import { templateHeaderMediaSchema } from './media.js';

/** Template languages offered in the editor (Meta codes). */
export const TEMPLATE_LANGUAGES = {
  en: 'English',
  en_US: 'English (US)',
  en_GB: 'English (UK)',
  hi: 'Hindi',
  mr: 'Marathi',
  gu: 'Gujarati',
  bn: 'Bengali',
  pa: 'Punjabi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ml: 'Malayalam',
  ur: 'Urdu',
} as const;
export const templateLanguageSchema = z.enum(
  Object.keys(TEMPLATE_LANGUAGES) as [keyof typeof TEMPLATE_LANGUAGES],
);

/** The {{n}} placeholders in a text, in order of appearance. */
export function templateVariables(text: string): number[] {
  return [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
}

/** GET /api/templates — the WhatsApp account's message templates as Meta reports them (M6). */
export const messageTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  category: z.string(),
  /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED, … */
  status: z.string(),
  headerFormat: z.string().nullable(),
  headerText: z.string().nullable(),
  bodyText: z.string(),
  footerText: z.string().nullable(),
  buttons: z.array(z.object({ type: z.string(), text: z.string() })),
  rejectedReason: z.string().nullable(),
  qualityScore: z.string().nullable(),
  /** Where the AI agent uses it right now. */
  usedFor: z.array(z.enum(['opening', 'followup'])),
});
export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

export const templateListSchema = z.object({
  connected: z.boolean(),
  reason: z.string().nullable(),
  templates: z.array(messageTemplateSchema),
});
export type TemplateList = z.infer<typeof templateListSchema>;

/** POST /api/templates — submit a new template to Meta for review. */
export const createTemplateRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,512}$/, 'Use lowercase letters, digits and _ only'),
    language: templateLanguageSchema,
    category: z.enum(['MARKETING', 'UTILITY']),
    headerText: z
      .string()
      .trim()
      .max(60)
      .refine((text) => !/\{\{/.test(text), 'Variables are not supported in the header')
      .optional(),
    /** An image, video or PDF header instead of a text header (D-084). */
    headerMedia: templateHeaderMediaSchema.optional(),
    bodyText: z.string().trim().min(1, 'Write the message').max(1_024),
    /** One example value per {{n}} in the body, in order (Meta reviews with them). */
    examples: z.array(z.string().trim().min(1, 'Give an example').max(200)).max(20).default([]),
    footerText: z.string().trim().max(60).optional(),
    buttons: z.array(z.string().trim().min(1).max(25)).max(10).default([]),
  })
  .superRefine((input, context) => {
    const variables = templateVariables(input.bodyText);
    const unique = [...new Set(variables)].sort((a, b) => a - b);
    if (unique.some((value, index) => value !== index + 1)) {
      context.addIssue({
        code: 'custom',
        path: ['bodyText'],
        message: 'Number the variables {{1}}, {{2}}, … without gaps',
      });
    }
    if (input.examples.length !== unique.length) {
      context.addIssue({
        code: 'custom',
        path: ['examples'],
        message: `Give one example for each variable (${unique.length})`,
      });
    }
    if (input.headerText && input.headerMedia) {
      context.addIssue({
        code: 'custom',
        path: ['headerText'],
        message: 'Use either a text header or a media header',
      });
    }
    if (new Set(input.buttons).size !== input.buttons.length) {
      context.addIssue({ code: 'custom', path: ['buttons'], message: 'Buttons must differ' });
    }
  });
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

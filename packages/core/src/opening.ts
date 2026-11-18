import type { PlaybookConfig, PlaybookOpening } from '@qualify/shared';
import type { LeadFields } from './fields.ts';

/** Default opening for playbooks created before M4 (no template approved yet). */
export function defaultOpening(config: PlaybookConfig): PlaybookOpening {
  return {
    templateName: null,
    templateLanguage: 'en',
    bodyText: `Hi {{1}}! 👋 Thanks for your enquiry with {{2}}. I'm ${config.persona.name}, your ${config.persona.role}. Can I ask you 2–3 quick questions to share the best options?`,
    bodyParams: ['lead.firstName', 'business.name'],
    buttons: ['Yes, sure', 'Not now'],
  };
}

export function resolveOpening(config: PlaybookConfig): PlaybookOpening {
  return config.opening ?? defaultOpening(config);
}

export interface OpeningContext {
  leadName: string | null;
  fields: LeadFields;
  businessName: string;
}

/** WhatsApp rejects template parameters with newlines, tabs or 4+ consecutive spaces. */
function cleanParam(value: string): string {
  return value
    .replace(/[\n\t]+/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim()
    .slice(0, 200);
}

/**
 * Resolves one parameter spec:
 *   lead.firstName | lead.name | business.name | field:<key>[|fallback] | text:<literal>
 */
export function resolveParam(spec: string, context: OpeningContext): string {
  const [source, fallback] = spec.split('|');
  let value: string | undefined;
  if (source === 'lead.firstName') value = context.leadName?.trim().split(/\s+/)[0];
  else if (source === 'lead.name') value = context.leadName?.trim();
  else if (source === 'business.name') value = context.businessName;
  else if (source?.startsWith('field:')) value = context.fields[source.slice('field:'.length)];
  else if (source?.startsWith('text:')) value = source.slice('text:'.length);

  // WhatsApp rejects empty parameters, so a blank value or fallback counts as missing.
  const resolved = value?.trim() ? value : fallback?.trim() || defaultFallback(source);
  return cleanParam(resolved);
}

function defaultFallback(source: string | undefined): string {
  return source?.startsWith('lead.') ? 'there' : 'us';
}

/** Fills {{1}}, {{2}}… The text is what the lead receives (and what the AI sees as history). */
export function renderOpening(
  opening: PlaybookOpening,
  context: OpeningContext,
): { text: string; params: string[] } {
  const params = opening.bodyParams.map((spec) => resolveParam(spec, context));
  const text = opening.bodyText.replace(/\{\{(\d+)\}\}/g, (match, index: string) => {
    return params[Number(index) - 1] ?? match;
  });
  return { text, params };
}

/** 32-bit FNV-1a, as 8 hex characters. Stable across runtimes (browser and Node). */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Template name for an opening's text, buttons and language. A changed text maps to a new name,
 * so it gets its own Meta approval (approved templates can't be silently edited).
 */
export function openingTemplateName(
  opening: Pick<PlaybookOpening, 'bodyText' | 'buttons' | 'templateLanguage'>,
): string {
  return messageTemplateName('qualify_opening', opening);
}

/** "<prefix>_<hash of language, text and buttons>": one Meta template per distinct text. */
export function messageTemplateName(
  prefix: string,
  message: Pick<PlaybookOpening, 'bodyText' | 'buttons' | 'templateLanguage'>,
): string {
  const content = [message.templateLanguage, message.bodyText, ...message.buttons].join('\u0000');
  return `${prefix}_${fnv1a(content)}`;
}

/** Example values Meta requires for each {{n}} when a template is submitted for review. */
export function openingExampleParams(opening: PlaybookOpening, businessName: string): string[] {
  const fields: LeadFields = {};
  for (const spec of opening.bodyParams) {
    const source = spec.split('|')[0] ?? '';
    if (source.startsWith('field:')) fields[source.slice('field:'.length)] = 'Dubai';
  }
  return opening.bodyParams.map((spec) =>
    resolveParam(spec, { leadName: 'Rahul Sharma', fields, businessName }),
  );
}

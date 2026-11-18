import { z } from 'zod';

// WhatsApp Cloud API webhook payloads. Schemas are deliberately lenient (`looseObject`):
// Meta adds fields over time and an unknown field must never make us drop a lead's message.

const textSchema = z.looseObject({ body: z.string() });

const interactiveSchema = z.looseObject({
  type: z.string(),
  button_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
  list_reply: z.looseObject({ id: z.string(), title: z.string() }).optional(),
});

/** Click-to-WhatsApp ad context on the first message (used for routing in M4). */
const referralSchema = z.looseObject({
  source_type: z.string().optional(),
  source_id: z.string().optional(),
  source_url: z.string().optional(),
  headline: z.string().optional(),
  body: z.string().optional(),
  ctwa_clid: z.string().optional(),
});

export const waInboundMessageSchema = z.looseObject({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: textSchema.optional(),
  interactive: interactiveSchema.optional(),
  button: z.looseObject({ text: z.string(), payload: z.string().optional() }).optional(),
  referral: referralSchema.optional(),
});
export type WaInboundMessage = z.infer<typeof waInboundMessageSchema>;

/**
 * Coexistence: a message the business sent from the WhatsApp Business app (or a linked device)
 * on a number that is also on Cloud API (`smb_message_echoes`). `to` is the customer.
 */
export const waEchoSchema = z.looseObject({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: textSchema.optional(),
});
export type WaEcho = z.infer<typeof waEchoSchema>;

export const waStatusSchema = z.looseObject({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']).or(z.string()),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  errors: z
    .array(z.looseObject({ code: z.number().optional(), title: z.string().optional() }))
    .optional(),
  /** Per-message pricing (PMP): whether Meta bills this message, and its category. */
  pricing: z
    .looseObject({
      billable: z.boolean().optional(),
      category: z.string().optional(),
      type: z.string().optional(),
      pricing_model: z.string().optional(),
    })
    .optional(),
});
export type WaStatus = z.infer<typeof waStatusSchema>;

const waValueSchema = z.looseObject({
  messaging_product: z.string().optional(),
  metadata: z.looseObject({ display_phone_number: z.string(), phone_number_id: z.string() }),
  contacts: z
    .array(
      z.looseObject({ wa_id: z.string(), profile: z.looseObject({ name: z.string() }).optional() }),
    )
    .optional(),
  messages: z.array(waInboundMessageSchema).optional(),
  statuses: z.array(waStatusSchema).optional(),
  message_echoes: z.array(waEchoSchema).optional(),
});
export type WaValue = z.infer<typeof waValueSchema>;

export const waWebhookSchema = z.looseObject({
  object: z.string(),
  entry: z.array(
    z.looseObject({
      id: z.string(),
      changes: z.array(z.looseObject({ field: z.string(), value: z.unknown() })),
    }),
  ),
});

export interface WaMessagesChange {
  wabaId: string;
  value: WaValue;
}

/** WABA webhook fields we handle; others (templates, account updates…) are skipped. */
const HANDLED_FIELDS = new Set(['messages', 'smb_message_echoes']);

/** Extracts the message changes we handle (incl. Coexistence echoes). */
export function extractMessageChanges(payload: unknown): WaMessagesChange[] {
  const parsed = waWebhookSchema.parse(payload);
  if (parsed.object !== 'whatsapp_business_account') return [];
  const changes: WaMessagesChange[] = [];
  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      if (!HANDLED_FIELDS.has(change.field)) continue;
      changes.push({ wabaId: entry.id, value: waValueSchema.parse(change.value) });
    }
  }
  return changes;
}

/** Human-readable text of an inbound message (null for media we don't read yet). */
export function inboundText(message: WaInboundMessage): string | null {
  if (message.text) return message.text.body;
  if (message.interactive?.button_reply) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply) return message.interactive.list_reply.title;
  if (message.button) return message.button.text;
  return null;
}

/** A Page `leadgen` change: someone submitted a lead form (the answers are fetched separately). */
export const leadgenValueSchema = z.looseObject({
  leadgen_id: z.coerce.string(),
  page_id: z.coerce.string(),
  form_id: z.coerce.string(),
  ad_id: z.coerce.string().optional(),
  created_time: z.number().optional(),
});
export type LeadgenValue = z.infer<typeof leadgenValueSchema>;

/** Extracts lead form submissions from a Page webhook delivery; other fields are skipped. */
export function extractLeadgenChanges(payload: unknown): LeadgenValue[] {
  const parsed = waWebhookSchema.parse(payload);
  if (parsed.object !== 'page') return [];
  return parsed.entry.flatMap((entry) =>
    entry.changes
      .filter((change) => change.field === 'leadgen')
      .flatMap((change) => {
        const value = leadgenValueSchema.safeParse(change.value);
        return value.success ? [value.data] : [];
      }),
  );
}

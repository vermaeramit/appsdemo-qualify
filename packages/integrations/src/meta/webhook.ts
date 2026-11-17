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

export const waStatusSchema = z.looseObject({
  id: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']).or(z.string()),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  errors: z
    .array(z.looseObject({ code: z.number().optional(), title: z.string().optional() }))
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

/** Extracts the `messages` changes we handle; other fields (templates, account updates…) are skipped. */
export function extractMessageChanges(payload: unknown): WaMessagesChange[] {
  const parsed = waWebhookSchema.parse(payload);
  if (parsed.object !== 'whatsapp_business_account') return [];
  const changes: WaMessagesChange[] = [];
  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
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

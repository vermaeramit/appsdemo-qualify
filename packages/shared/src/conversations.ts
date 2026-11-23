import { z } from 'zod';
import { inboundMediaSchema } from './media.js';
import { leadAttributionSchema, leadGradeSchema, leadScoreDetailsSchema } from './lead.js';
import { storedLeadOutcomeSchema } from './leads-api.js';

export const messageDirectionSchema = z.enum(['inbound', 'outbound']);
export const messageSenderSchema = z.enum(['lead', 'ai', 'human_app', 'system']);
export const messageStatusSchema = z.enum([
  'received',
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
]);

export const conversationSummarySchema = z.object({
  leadId: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.iso.datetime().nullable(),
  messageCount: z.number().int().nonnegative(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationListSchema = z.object({
  conversations: z.array(conversationSummarySchema),
  /** Cursor for the next page (older activity), or null on the last page. */
  nextCursor: z.string().nullable(),
});
export type ConversationList = z.infer<typeof conversationListSchema>;

/**
 * What an incoming non-text message was (D-099), read from the stored WhatsApp payload: a photo,
 * a voice message, a location… or a message WhatsApp didn't pass on (with Meta's error).
 */
export const inboundDisplayKindSchema = z.enum([
  'image',
  'video',
  'voice',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
  'reaction',
  'order',
  'unsupported',
  'other',
]);
export type InboundDisplayKind = z.infer<typeof inboundDisplayKindSchema>;

export const inboundDisplaySchema = z.object({
  kind: inboundDisplayKindSchema,
  /** "Photo", "Voice message", "Document: brochure.pdf"… */
  label: z.string(),
  /** Caption, address, phone number, file details… */
  detail: z.string().nullable(),
  /** Unsupported messages: Meta's error, e.g. "131051: Message type is currently not supported." */
  metaError: z.string().nullable(),
  /** The file itself, when the message carried one (D-100). */
  media: inboundMediaSchema.nullable(),
});
export type InboundDisplay = z.infer<typeof inboundDisplaySchema>;

export const conversationMessageSchema = z.object({
  id: z.uuid(),
  direction: messageDirectionSchema,
  sender: messageSenderSchema,
  type: z.string(),
  body: z.string().nullable(),
  status: messageStatusSchema,
  /** Why a failed message was not delivered (shown under the bubble). */
  errorMessage: z.string().nullable(),
  /** Incoming non-text messages: what it was (D-099); null for text. */
  display: inboundDisplaySchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationThreadSchema = z.object({
  lead: z.object({
    id: z.uuid(),
    phone: z.string(),
    name: z.string().nullable(),
    status: z.string(),
    aiPaused: z.boolean(),
    language: z.string().nullable(),
    /** Collected qualification fields: key → normalised value. */
    fields: z.record(z.string(), z.string()),
    /** Answers that came with the lead (form / API) and the lead hasn't confirmed yet (D-089). */
    unconfirmedFields: z.array(z.string()),
    /** Field definitions of the playbook (for labels/order in the UI). */
    fieldDefinitions: z.array(
      z.object({ key: z.string(), label: z.string(), required: z.boolean() }),
    ),
    /** Hybrid score and grade (null until first scored), with breakdown and summary. */
    score: z.number().int().nullable(),
    grade: leadGradeSchema.nullable(),
    scoreDetails: leadScoreDetailsSchema.nullable(),
    summary: z.string().nullable(),
    source: z.string(),
    /** The agent (playbook) that handles this lead (D-086). */
    agentName: z.string().nullable(),
    attribution: leadAttributionSchema.nullable(),
    outcome: storedLeadOutcomeSchema.nullable(),
  }),
  /** The latest messages, oldest first. */
  messages: z.array(conversationMessageSchema),
  /** Cursor for older messages (?before=…), or null when this is the start of the chat. */
  olderCursor: z.string().nullable(),
});
export type ConversationThread = z.infer<typeof conversationThreadSchema>;

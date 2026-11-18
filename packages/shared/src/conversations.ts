import { z } from 'zod';
import { leadAttributionSchema, leadGradeSchema, leadScoreDetailsSchema } from './lead.js';

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

export const conversationMessageSchema = z.object({
  id: z.uuid(),
  direction: messageDirectionSchema,
  sender: messageSenderSchema,
  type: z.string(),
  body: z.string().nullable(),
  status: messageStatusSchema,
  /** Why a failed message was not delivered (shown under the bubble). */
  errorMessage: z.string().nullable(),
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
    attribution: leadAttributionSchema.nullable(),
  }),
  /** The latest messages, oldest first. */
  messages: z.array(conversationMessageSchema),
  /** Cursor for older messages (?before=…), or null when this is the start of the chat. */
  olderCursor: z.string().nullable(),
});
export type ConversationThread = z.infer<typeof conversationThreadSchema>;

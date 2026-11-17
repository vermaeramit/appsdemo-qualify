import { z } from 'zod';

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
});
export type ConversationList = z.infer<typeof conversationListSchema>;

export const conversationMessageSchema = z.object({
  id: z.uuid(),
  direction: messageDirectionSchema,
  sender: messageSenderSchema,
  type: z.string(),
  body: z.string().nullable(),
  status: messageStatusSchema,
  createdAt: z.iso.datetime(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationThreadSchema = z.object({
  lead: z.object({ id: z.uuid(), phone: z.string(), name: z.string().nullable() }),
  messages: z.array(conversationMessageSchema),
});
export type ConversationThread = z.infer<typeof conversationThreadSchema>;

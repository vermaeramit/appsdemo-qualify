import type { PlaybookConfig } from '@qualify/shared';
import type { LeadFields } from './fields.ts';
import type { HistoryMessage } from './history.ts';

/** Most recent messages a summary reads (older context lives in the collected answers). */
const SUMMARY_MESSAGES = 60;

/**
 * Prompt for the 2–3 line summary the sales team reads in the inbox, Excel and webhooks. The
 * transcript goes in one message, so the model doesn't mistake it for a live chat.
 */
export function buildSummaryRequest(
  config: PlaybookConfig,
  history: readonly HistoryMessage[],
  fields: LeadFields,
): { system: string; prompt: string } {
  const labels = new Map(config.fields.map((field) => [field.key, field.label]));
  const answers = Object.entries(fields)
    .map(([key, value]) => `${labels.get(key) ?? key}: ${value}`)
    .join('; ');
  const transcript = history
    .slice(-SUMMARY_MESSAGES)
    .filter((message) => message.body)
    .map((message) => `${message.direction === 'inbound' ? 'Lead' : 'Agent'}: ${message.body}`)
    .join('\n');

  return {
    system: `You summarise WhatsApp lead conversations for the sales team of ${config.business.name}. Write 2–3 short plain sentences in English (no greeting, no bullet points, no markdown): what the lead wants, the key details, how ready they are, and anything the team should know before calling (objections, requests, preferred time). Use only facts from the conversation.`,
    prompt: `Collected answers: ${answers || 'none'}\n\nConversation:\n${transcript}\n\nWrite the summary.`,
  };
}

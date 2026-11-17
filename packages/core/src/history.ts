export interface HistoryMessage {
  direction: 'inbound' | 'outbound';
  sender: 'lead' | 'ai' | 'human_app' | 'system';
  type: string;
  body: string | null;
}

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** How many recent messages the model sees. Older context lives in the collected fields. */
export const HISTORY_LIMIT = 30;

/**
 * Converts stored messages (oldest first) into chat turns for the model.
 * Lead → user; everything we sent → assistant. Consecutive turns of the same role are merged
 * (a lead often sends several short messages in a row).
 */
export function toModelHistory(messages: readonly HistoryMessage[]): ModelMessage[] {
  const recent = messages.slice(-HISTORY_LIMIT);
  const turns: ModelMessage[] = [];
  for (const message of recent) {
    const role = message.direction === 'inbound' ? 'user' : 'assistant';
    let content =
      message.body ??
      (role === 'user'
        ? `[The lead sent a ${message.type} message. You can only read text, so ask them to type it.]`
        : `[${message.type} message]`);
    if (message.sender === 'human_app') content = `[Sent by a human team member] ${content}`;

    const last = turns.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n${content}`;
    else turns.push({ role, content });
  }
  // A leading assistant turn (e.g. our opening template in M4) is kept: it is useful context.
  return turns;
}

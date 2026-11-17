/** WhatsApp customer-service window: free-form replies are allowed for 24 h after the lead's last message. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Safety margin so we never send right at the edge of the window. */
const WINDOW_MARGIN_MS = 5 * 60 * 1000;

export function isServiceWindowOpen(lastInboundAt: Date | null, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS - WINDOW_MARGIN_MS;
}

const MAX_QUICK_REPLIES = 3; // WhatsApp reply buttons
const MAX_BUTTON_TITLE = 20; // WhatsApp button title limit

/** Shortens to the WhatsApp limit at a word boundary when possible ("In 2–3 months, please" → "In 2–3 months"). */
function fitButtonTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_BUTTON_TITLE) return clean;
  const cut = clean.slice(0, MAX_BUTTON_TITLE);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace >= 8 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '');
}

/** Keeps at most 3 unique, non-empty quick replies that fit WhatsApp's 20-character limit. */
export function sanitizeQuickReplies(options: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const option of options) {
    const title = fitButtonTitle(option);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    result.push(title);
    if (result.length === MAX_QUICK_REPLIES) break;
  }
  return result;
}

/** Signals are 0–10 integers; models occasionally return floats or out-of-range numbers. */
export function clampSignal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(10, Math.max(0, Math.round(value)));
}

/** WhatsApp text messages are limited to 4096 characters; ours should be far shorter. */
export const MAX_REPLY_CHARS = 1000;

export function sanitizeReply(text: string): string {
  return text.trim().slice(0, MAX_REPLY_CHARS);
}

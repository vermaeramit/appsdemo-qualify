import type { ReplyOptions } from '@qualify/core';
import { type MessageHeaderMedia, MetaApiError, type WhatsAppClient } from '@qualify/integrations';

export type AgentMessagingClient = Pick<
  WhatsAppClient,
  'sendText' | 'sendButtons' | 'sendList' | 'sendTemplate' | 'markRead'
> &
  Partial<Pick<WhatsAppClient, 'uploadMedia' | 'sendMedia' | 'findTemplates'>>;

export interface SendResult {
  waMessageId: string | null;
  error: Record<string, unknown> | null;
  /** Stored message type. */
  type: 'text' | 'interactive' | 'template';
}

export function describeSendError(error: unknown): Record<string, unknown> {
  return error instanceof MetaApiError
    ? { message: error.message, status: error.status, code: error.code ?? null }
    : { message: error instanceof Error ? error.message : String(error) };
}

/** Sends a reply as plain text, reply buttons or a list menu, depending on the options. */
export async function sendWithOptions(
  client: AgentMessagingClient,
  input: {
    phoneNumberId: string;
    to: string;
    body: string;
    options: ReplyOptions;
    /** A media header (only on reply buttons). */
    header?: MessageHeaderMedia | null;
  },
): Promise<SendResult> {
  const { phoneNumberId, to, body, options } = input;
  const type = options.kind === 'none' ? 'text' : 'interactive';
  try {
    const sent =
      options.kind === 'buttons'
        ? await client.sendButtons({
            phoneNumberId,
            to,
            body,
            buttons: options.buttons,
            ...(input.header ? { header: input.header } : {}),
          })
        : options.kind === 'list'
          ? await client.sendList({
              phoneNumberId,
              to,
              body,
              buttonLabel: options.buttonLabel,
              rows: options.rows,
            })
          : await client.sendText({ phoneNumberId, to, body });
    return { waMessageId: sent.messageId, error: null, type };
  } catch (error) {
    return { waMessageId: null, error: describeSendError(error), type };
  }
}

/** An image, video or document with the text as its caption (no buttons). */
export async function sendCaptionedMedia(
  sendMedia: WhatsAppClient['sendMedia'],
  input: { phoneNumberId: string; to: string; media: MessageHeaderMedia; caption: string },
): Promise<SendResult> {
  try {
    const sent = await sendMedia(input);
    return { waMessageId: sent.messageId, error: null, type: 'text' };
  } catch (error) {
    return { waMessageId: null, error: describeSendError(error), type: 'text' };
  }
}

// Minimal WhatsApp Cloud API client (Graph API). One instance per tenant token.

export const DEFAULT_GRAPH_VERSION = 'v24.0';

export class MetaApiError extends Error {
  readonly status: number;
  readonly code: number | undefined;
  readonly details: unknown;

  constructor(status: number, message: string, code: number | undefined, details: unknown) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
}

export interface WhatsAppClientOptions {
  accessToken: string;
  graphVersion?: string;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

export interface PhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  platform_type?: string;
}

function requireMessageId(result: { messages?: { id: string }[] }): string {
  const messageId = result.messages?.[0]?.id;
  if (!messageId)
    throw new MetaApiError(500, 'Cloud API returned no message id', undefined, result);
  return messageId;
}

export class WhatsAppClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: WhatsAppClientOptions) {
    this.baseUrl = `https://graph.facebook.com/${options.graphVersion ?? DEFAULT_GRAPH_VERSION}`;
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Sends a free-form text message (only valid inside the 24 h customer-service window). */
  async sendText(params: {
    phoneNumberId: string;
    to: string;
    body: string;
    replyToMessageId?: string;
  }): Promise<{ messageId: string }> {
    const result = await this.request<{ messages?: { id: string }[] }>(
      'POST',
      `/${params.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'text',
        text: { body: params.body, preview_url: false },
        ...(params.replyToMessageId ? { context: { message_id: params.replyToMessageId } } : {}),
      },
    );
    const messageId = result.messages?.[0]?.id;
    if (!messageId)
      throw new MetaApiError(500, 'Cloud API returned no message id', undefined, result);
    return { messageId };
  }

  /**
   * Sends a message with up to 3 reply buttons (WhatsApp interactive "button" message).
   * Button ids are `qr_1`…; the lead's tap arrives as an interactive button_reply.
   */
  async sendButtons(params: {
    phoneNumberId: string;
    to: string;
    body: string;
    buttons: readonly string[];
  }): Promise<{ messageId: string }> {
    const result = await this.request<{ messages?: { id: string }[] }>(
      'POST',
      `/${params.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: params.body },
          action: {
            buttons: params.buttons.slice(0, 3).map((title, index) => ({
              type: 'reply',
              reply: { id: `qr_${index + 1}`, title: title.slice(0, 20) },
            })),
          },
        },
      },
    );
    const messageId = result.messages?.[0]?.id;
    if (!messageId)
      throw new MetaApiError(500, 'Cloud API returned no message id', undefined, result);
    return { messageId };
  }

  /** Sends a list menu (up to 10 rows; row titles ≤24 chars). The lead's pick arrives as list_reply. */
  async sendList(params: {
    phoneNumberId: string;
    to: string;
    body: string;
    buttonLabel: string;
    rows: readonly string[];
  }): Promise<{ messageId: string }> {
    const result = await this.request<{ messages?: { id: string }[] }>(
      'POST',
      `/${params.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: params.body },
          action: {
            button: params.buttonLabel.slice(0, 20),
            sections: [
              {
                title: 'Options',
                rows: params.rows.slice(0, 10).map((title, index) => ({
                  id: `opt_${index + 1}`,
                  title: title.slice(0, 24),
                })),
              },
            ],
          },
        },
      },
    );
    return { messageId: requireMessageId(result) };
  }

  /** Sends an approved template (the only message type allowed outside the 24 h window). */
  async sendTemplate(params: {
    phoneNumberId: string;
    to: string;
    templateName: string;
    language: string;
    bodyParams: readonly string[];
  }): Promise<{ messageId: string }> {
    const result = await this.request<{ messages?: { id: string }[] }>(
      'POST',
      `/${params.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'template',
        template: {
          name: params.templateName,
          language: { code: params.language },
          ...(params.bodyParams.length
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: params.bodyParams.map((text) => ({ type: 'text', text })),
                  },
                ],
              }
            : {}),
        },
      },
    );
    return { messageId: requireMessageId(result) };
  }

  /** Submits a message template to Meta for review (status starts as PENDING). */
  async createTemplate(params: {
    wabaId: string;
    name: string;
    language: string;
    category: 'MARKETING' | 'UTILITY';
    bodyText: string;
    bodyExample: readonly string[];
    quickReplies: readonly string[];
  }): Promise<{ id: string; status: string; category: string }> {
    return this.request('POST', `/${params.wabaId}/message_templates`, {
      name: params.name,
      language: params.language,
      category: params.category,
      components: [
        {
          type: 'BODY',
          text: params.bodyText,
          ...(params.bodyExample.length ? { example: { body_text: [params.bodyExample] } } : {}),
        },
        ...(params.quickReplies.length
          ? [
              {
                type: 'BUTTONS',
                buttons: params.quickReplies.map((text) => ({ type: 'QUICK_REPLY', text })),
              },
            ]
          : []),
      ],
    });
  }

  /** Templates with a given name on a WABA (status: APPROVED, PENDING, REJECTED…). */
  async findTemplates(
    wabaId: string,
    name: string,
  ): Promise<{
    data: { id: string; name: string; status: string; language: string; category: string }[];
  }> {
    return this.request(
      'GET',
      `/${wabaId}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status,language,category`,
    );
  }

  /** Marks an inbound message as read (blue ticks); optionally shows "typing…" to the lead. */
  async markRead(
    phoneNumberId: string,
    messageId: string,
    options: { typing?: boolean } = {},
  ): Promise<void> {
    await this.request('POST', `/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      ...(options.typing ? { typing_indicator: { type: 'text' } } : {}),
    });
  }

  async getPhoneNumber(phoneNumberId: string): Promise<PhoneNumberInfo> {
    return this.request<PhoneNumberInfo>(
      'GET',
      `/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type`,
    );
  }

  /** Apps subscribed to a WABA's webhooks. */
  async listSubscribedApps(wabaId: string): Promise<{ data: unknown[] }> {
    return this.request<{ data: unknown[] }>('GET', `/${wabaId}/subscribed_apps`);
  }

  /** Subscribes the token's app to the WABA's webhooks. */
  async subscribeApp(wabaId: string): Promise<void> {
    await this.request('POST', `/${wabaId}/subscribed_apps`);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : null,
    });
    const json: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = (json as GraphErrorBody).error;
      throw new MetaApiError(
        response.status,
        error?.message ?? `Graph API ${method} ${path} failed with ${response.status}`,
        error?.code,
        json,
      );
    }
    return json as T;
  }
}

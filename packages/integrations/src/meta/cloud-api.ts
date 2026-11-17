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

  /** Marks an inbound message as read (blue ticks). */
  async markRead(phoneNumberId: string, messageId: string): Promise<void> {
    await this.request('POST', `/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
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

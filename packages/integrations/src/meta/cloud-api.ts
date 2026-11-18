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

export interface MetaLead {
  id: string;
  created_time?: string;
  field_data: { name: string; values: string[] }[];
  form_id?: string;
  ad_id?: string;
  campaign_id?: string;
  platform?: string;
}

export interface MetaLeadForm {
  id: string;
  name?: string;
  questions?: {
    key: string;
    label?: string;
    type?: string;
    options?: { key: string; value: string }[];
  }[];
}

export interface PricingAnalyticsPoint {
  /** Unix seconds. */
  start: number;
  end: number;
  pricing_category?: string;
  pricing_type?: string;
  country?: string;
  volume: number;
  cost: number;
}

/** A phone number's health as Meta reports it (M6). */
export interface PhoneNumberHealth {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  name_status?: string;
  throughput?: { level?: string };
  platform_type?: string;
  /** Messaging limit, now set per business portfolio (e.g. TIER_2K). */
  whatsapp_business_manager_messaging_limit?: string;
}

export interface WabaInfo {
  id: string;
  name?: string;
  account_review_status?: string;
  business_verification_status?: string;
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

/**
 * Embedded Signup: trades the code from the customer's popup (5-minute lifetime) for a business
 * token for their WhatsApp account. Server-to-server, with the app secret.
 */
export async function exchangeSignupCode(input: {
  appId: string;
  appSecret: string;
  code: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const url = new URL(
    `https://graph.facebook.com/${input.graphVersion ?? DEFAULT_GRAPH_VERSION}/oauth/access_token`,
  );
  url.search = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
  }).toString();
  const response = await (input.fetchImpl ?? fetch)(url, { method: 'GET' });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string; code?: number };
  };
  if (!response.ok || !json.access_token) {
    throw new MetaApiError(
      response.status,
      json.error?.message ?? 'Meta did not return a token for this sign-up code',
      json.error?.code,
      json,
    );
  }
  return json.access_token;
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
    data: {
      id: string;
      name: string;
      status: string;
      language: string;
      category: string;
      rejected_reason?: string;
    }[];
  }> {
    return this.request(
      'GET',
      `/${wabaId}/message_templates?name=${encodeURIComponent(name)}&fields=id,name,status,language,category,rejected_reason`,
    );
  }

  /**
   * What Meta billed on a WABA: daily volume and cost (in the WABA's currency) per pricing
   * category and type. Up to 90 days back; Meta updates it with some delay.
   */
  async getPricingAnalytics(
    wabaId: string,
    params: { start: number; end: number },
  ): Promise<PricingAnalyticsPoint[]> {
    const field =
      `pricing_analytics.start(${Math.floor(params.start)}).end(${Math.floor(params.end)})` +
      '.granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])';
    const result = await this.request<{
      pricing_analytics?: { data?: { data_points?: PricingAnalyticsPoint[] }[] };
    }>('GET', `/${wabaId}?fields=${encodeURIComponent(field)}`);
    return (result.pricing_analytics?.data ?? []).flatMap((entry) => entry.data_points ?? []);
  }

  /** A lead form submission's answers (needs a Page token with leads_retrieval). */
  async getLead(leadgenId: string): Promise<MetaLead> {
    return this.request<MetaLead>(
      'GET',
      `/${leadgenId}?fields=id,created_time,field_data,form_id,ad_id,campaign_id,platform`,
    );
  }

  /** A lead form's name and questions (labels and options), to map answers to the playbook. */
  async getLeadForm(formId: string): Promise<MetaLeadForm> {
    return this.request<MetaLeadForm>('GET', `/${formId}?fields=id,name,questions`);
  }

  /** Lead forms of a Page. */
  async listLeadForms(
    pageId: string,
  ): Promise<{ data: { id: string; name: string; status: string }[] }> {
    return this.request('GET', `/${pageId}/leadgen_forms?fields=id,name,status&limit=100`);
  }

  /** Pages the token can manage, with their Page tokens (never log the result). */
  async listPages(): Promise<{
    data: { id: string; name: string; access_token?: string; tasks?: string[] }[];
  }> {
    return this.request('GET', '/me/accounts?fields=id,name,access_token,tasks&limit=100');
  }

  /** Subscribes our app to a Page's leadgen webhooks (call with that Page's token). */
  async subscribeAppToPage(pageId: string): Promise<void> {
    await this.request('POST', `/${pageId}/subscribed_apps?subscribed_fields=leadgen`);
  }

  /** The WABA's billing currency (e.g. "INR"). */
  async getWabaCurrency(wabaId: string): Promise<string | null> {
    const result = await this.request<{ currency?: string }>('GET', `/${wabaId}?fields=currency`);
    return result.currency ?? null;
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

  async getPhoneHealth(phoneNumberId: string): Promise<PhoneNumberHealth> {
    return this.request<PhoneNumberHealth>(
      'GET',
      `/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,status,name_status,throughput,platform_type,whatsapp_business_manager_messaging_limit`,
    );
  }

  async getWabaInfo(wabaId: string): Promise<WabaInfo> {
    return this.request<WabaInfo>(
      'GET',
      `/${wabaId}?fields=name,account_review_status,business_verification_status`,
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

  /** Phone numbers of a WhatsApp account (Embedded Signup may return only the account id). */
  async listPhoneNumbers(wabaId: string): Promise<{ data: PhoneNumberInfo[] }> {
    return this.request<{ data: PhoneNumberInfo[] }>(
      'GET',
      `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type`,
    );
  }

  /** Registers a Cloud API number with a 6-digit two-step PIN. Never for Coexistence numbers. */
  async registerPhoneNumber(phoneNumberId: string, pin: string): Promise<void> {
    await this.request('POST', `/${phoneNumberId}/register`, {
      messaging_product: 'whatsapp',
      pin,
    });
  }

  /**
   * Coexistence: asks Meta to send the business app's contacts (`smb_app_state_sync`) or its
   * message history (`history`) as webhooks. Each can run once, within 24 h of onboarding.
   */
  async syncBusinessAppData(
    phoneNumberId: string,
    syncType: 'smb_app_state_sync' | 'history',
  ): Promise<{ request_id?: string }> {
    return this.request<{ request_id?: string }>('POST', `/${phoneNumberId}/smb_app_data`, {
      messaging_product: 'whatsapp',
      sync_type: syncType,
    });
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

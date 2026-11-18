import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  extractMessageChanges,
  inboundText,
  isAllowedRecipient,
  MetaApiError,
  parseAllowlist,
  parseMasterKey,
  signMetaPayload,
  toE164,
  verifyMetaSignature,
  WhatsAppClient,
} from './index.ts';

const inboundPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '919350983656', phone_number_id: 'PN_ID' },
            contacts: [{ wa_id: '919812345678', profile: { name: 'Rahul' } }],
            messages: [
              {
                id: 'wamid.1',
                from: '919812345678',
                timestamp: '1763400000',
                type: 'text',
                text: { body: 'Dubai package price?' },
                some_future_field: true,
              },
            ],
          },
        },
        { field: 'message_template_status_update', value: { event: 'APPROVED' } },
      ],
    },
  ],
};

describe('crypto', () => {
  const key = randomBytes(32);

  it('round-trips a secret', () => {
    const encrypted = encryptSecret('EAAG-secret-token', key);
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted).not.toContain('EAAG');
    expect(decryptSecret(encrypted, key)).toBe('EAAG-secret-token');
  });

  it('detects tampering and wrong keys', () => {
    const encrypted = encryptSecret('secret', key);
    const parts = encrypted.split('.');
    const tampered = [...parts.slice(0, 3), Buffer.from('other').toString('base64url')].join('.');
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(encrypted, randomBytes(32))).toThrow();
  });

  it('validates the master key length', () => {
    expect(() => parseMasterKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(parseMasterKey(randomBytes(32).toString('base64url'))).toHaveLength(32);
  });
});

describe('verifyMetaSignature', () => {
  const body = Buffer.from(JSON.stringify(inboundPayload));

  it('accepts the correct signature', () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, 'app-secret'), 'app-secret')).toBe(true);
  });

  it('rejects wrong, missing or malformed signatures', () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, 'other'), 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, undefined, 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=abc', 'app-secret')).toBe(false);
    expect(verifyMetaSignature(body, 'md5=abc', 'app-secret')).toBe(false);
  });

  it('rejects a body that was modified after signing', () => {
    const signature = signMetaPayload(body, 'app-secret');
    expect(verifyMetaSignature(Buffer.from(`${body} `), signature, 'app-secret')).toBe(false);
  });
});

describe('webhook parsing', () => {
  it('extracts message changes and skips other fields', () => {
    const changes = extractMessageChanges(inboundPayload);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.value.metadata.phone_number_id).toBe('PN_ID');
    const message = changes[0]!.value.messages![0]!;
    expect(inboundText(message)).toBe('Dubai package price?');
  });

  it('reads button and list replies as text', () => {
    expect(
      inboundText({
        id: 'x',
        from: '1',
        timestamp: '1',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Next month' } },
      }),
    ).toBe('Next month');
  });

  it('ignores non-WhatsApp objects', () => {
    expect(extractMessageChanges({ object: 'page', entry: [] })).toEqual([]);
  });
});

describe('phone helpers and dev safety switch', () => {
  it('normalises WhatsApp ids to E.164', () => {
    expect(toE164('919812345678')).toBe('+919812345678');
    expect(() => toE164('123')).toThrow();
  });

  it('only allows listed numbers outside production', () => {
    const allowlist = parseAllowlist(' 919812345678, +91 98000 00000 ,');
    expect(allowlist).toEqual(['919812345678', '919800000000']);
    expect(isAllowedRecipient('919812345678', allowlist, false)).toBe(true);
    expect(isAllowedRecipient('919811111111', allowlist, false)).toBe(false);
    expect(isAllowedRecipient('919811111111', [], false)).toBe(false);
    expect(isAllowedRecipient('919811111111', [], true)).toBe(true);
  });
});

describe('WhatsAppClient', () => {
  it('sends a text message to the Cloud API', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ messages: [{ id: 'wamid.out' }] }, { status: 200 }),
    );
    const client = new WhatsAppClient({ accessToken: 'token', fetchImpl });

    const result = await client.sendText({ phoneNumberId: 'PN', to: '919812345678', body: 'Hi' });

    expect(result.messageId).toBe('wamid.out');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v24.0/PN/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: '919812345678',
      type: 'text',
      text: { body: 'Hi' },
    });
  });

  it('sends a list menu and a template with body parameters', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ messages: [{ id: 'wamid.x' }] }));
    const client = new WhatsAppClient({ accessToken: 'token', fetchImpl });

    await client.sendList({
      phoneNumberId: 'PN',
      to: '91',
      body: 'What kind of trip?',
      buttonLabel: 'Choose',
      rows: ['Honeymoon', 'Family', 'Friends', 'Solo'],
    });
    await client.sendTemplate({
      phoneNumberId: 'PN',
      to: '91',
      templateName: 'qualify_opening_v1',
      language: 'en',
      bodyParams: ['Rahul', 'Sunrise Holidays'],
    });

    const list = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(list.interactive).toMatchObject({
      type: 'list',
      action: {
        button: 'Choose',
        sections: [{ rows: [{ id: 'opt_1', title: 'Honeymoon' }, {}, {}, {}] }],
      },
    });
    const template = JSON.parse(
      (fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(template).toMatchObject({
      type: 'template',
      template: {
        name: 'qualify_opening_v1',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Rahul' },
              { type: 'text', text: 'Sunrise Holidays' },
            ],
          },
        ],
      },
    });
  });

  it('maps Graph API errors', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { message: 'Invalid token', code: 190 } }, { status: 401 }),
    );
    const client = new WhatsAppClient({ accessToken: 'bad', fetchImpl });
    const attempt = client.sendText({ phoneNumberId: 'PN', to: '91', body: 'x' });
    await expect(attempt).rejects.toBeInstanceOf(MetaApiError);
    await expect(attempt).rejects.toMatchObject({ status: 401, code: 190 });
  });
});

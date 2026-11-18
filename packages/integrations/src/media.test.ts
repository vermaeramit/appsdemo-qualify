import { describe, expect, it } from 'vitest';
import { uploadTemplateSample, WhatsAppClient } from './meta/cloud-api.ts';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(responses: unknown[]) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(responses.shift() ?? {}), { status: 200 });
  }) as typeof fetch;
  return { calls, impl };
}

const bodyOf = (call: Call) => JSON.parse(String(call.init?.body)) as Record<string, unknown>;

describe('template media (D-084)', () => {
  it('uploads a review sample with the Resumable Upload API', async () => {
    const { calls, impl } = fakeFetch([{ id: 'upload:abc' }, { h: '4::handle' }]);
    const handle = await uploadTemplateSample({
      appId: '123',
      accessToken: 'token',
      bytes: Buffer.from('png'),
      mime: 'image/png',
      fileName: 'offer.png',
      fetchImpl: impl,
    });
    expect(handle).toBe('4::handle');
    const started = new URL(calls[0]!.url);
    expect(started.pathname).toMatch(/\/123\/uploads$/);
    expect(started.searchParams.get('file_length')).toBe('3');
    expect(started.searchParams.get('file_type')).toBe('image/png');
    expect(calls[1]!.url).toMatch(/\/upload:abc$/);
    expect(calls[1]!.init?.headers).toMatchObject({
      Authorization: 'OAuth token',
      file_offset: '0',
    });
  });

  it('creates a template with an image header and sends it with the media id', async () => {
    const { calls, impl } = fakeFetch([
      { id: 't1', status: 'PENDING', category: 'MARKETING' },
      { messages: [{ id: 'wamid.1' }] },
    ]);
    const client = new WhatsAppClient({ accessToken: 'token', fetchImpl: impl });
    await client.createTemplate({
      wabaId: 'waba',
      name: 'offer',
      language: 'en',
      category: 'MARKETING',
      bodyText: 'Hi {{1}}',
      bodyExample: ['Asha'],
      quickReplies: [],
      headerMedia: { format: 'IMAGE', handle: '4::handle' },
    });
    expect((bodyOf(calls[0]!).components as unknown[])[0]).toEqual({
      type: 'HEADER',
      format: 'IMAGE',
      example: { header_handle: ['4::handle'] },
    });

    await client.sendTemplate({
      phoneNumberId: 'pn',
      to: '919800000001',
      templateName: 'offer',
      language: 'en',
      bodyParams: ['Asha'],
      header: { kind: 'DOCUMENT', mediaId: 'm1', fileName: 'Brochure.pdf' },
    });
    const template = bodyOf(calls[1]!).template as { components: unknown[] };
    expect(template.components[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'document', document: { id: 'm1', filename: 'Brochure.pdf' } }],
    });
    expect(template.components[1]).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'Asha' }],
    });
  });

  it('uploads media for sending and sends buttons or a caption with it', async () => {
    const { calls, impl } = fakeFetch([
      { id: 'media-1' },
      { messages: [{ id: 'wamid.2' }] },
      { messages: [{ id: 'wamid.3' }] },
    ]);
    const client = new WhatsAppClient({ accessToken: 'token', fetchImpl: impl });
    const id = await client.uploadMedia('pn', {
      bytes: Buffer.from('jpg'),
      mime: 'image/jpeg',
      fileName: 'a.jpg',
    });
    expect(id).toBe('media-1');
    expect(calls[0]!.url).toMatch(/\/pn\/media$/);
    expect(calls[0]!.init?.body).toBeInstanceOf(FormData);

    await client.sendButtons({
      phoneNumberId: 'pn',
      to: '919800000001',
      body: 'Interested?',
      buttons: ['Yes'],
      header: { kind: 'IMAGE', mediaId: 'media-1' },
    });
    expect((bodyOf(calls[1]!).interactive as Record<string, unknown>).header).toEqual({
      type: 'image',
      image: { id: 'media-1' },
    });

    await client.sendMedia({
      phoneNumberId: 'pn',
      to: '919800000001',
      media: { kind: 'VIDEO', mediaId: 'media-1' },
      caption: 'Watch this',
    });
    expect(bodyOf(calls[2]!)).toMatchObject({
      type: 'video',
      video: { id: 'media-1', caption: 'Watch this' },
    });
  });
});

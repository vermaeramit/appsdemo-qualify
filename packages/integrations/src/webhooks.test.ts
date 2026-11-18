import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  checkWebhookUrl,
  generateWebhookSecret,
  isPrivateAddress,
  postWebhook,
  signWebhook,
  verifyWebhookSignature,
} from './webhooks.ts';

const prod = { allowPrivate: false, requireHttps: true };
const dev = { allowPrivate: true, requireHttps: false };

describe('webhook signatures', () => {
  it('verifies our own signature and rejects tampering or stale timestamps', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[\w-]{32}$/);
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    const t = now / 1000;
    const header = signWebhook(secret, '{"a":1}', t);
    expect(verifyWebhookSignature(secret, '{"a":1}', header, { now })).toBe(true);
    expect(verifyWebhookSignature(secret, '{"a":2}', header, { now })).toBe(false);
    expect(verifyWebhookSignature('whsec_other', '{"a":1}', header, { now })).toBe(false);
    expect(verifyWebhookSignature(secret, '{"a":1}', header, { now: now + 600_000 })).toBe(false);
    expect(verifyWebhookSignature(secret, '{"a":1}', 'garbage', { now })).toBe(false);
  });
});

describe('webhook URL policy (SSRF)', () => {
  it('knows private and public addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('accepts public https URLs and refuses the rest in production', () => {
    expect(checkWebhookUrl('https://hooks.example.com/x', prod).hostname).toBe('hooks.example.com');
    expect(() => checkWebhookUrl('http://hooks.example.com/x', prod)).toThrow('https');
    expect(() => checkWebhookUrl('https://localhost/x', prod)).toThrow('public');
    expect(() => checkWebhookUrl('https://10.0.0.1/x', prod)).toThrow('public');
    expect(() => checkWebhookUrl('https://[::1]/x', prod)).toThrow('public');
    expect(() => checkWebhookUrl('https://user:pw@example.com/x', prod)).toThrow('password');
    expect(() => checkWebhookUrl('ftp://example.com/x', dev)).toThrow('https');
    expect(checkWebhookUrl('http://localhost:4000/x', dev).port).toBe('4000');
  });

  it('refuses a host that resolves to a private address at connect time', async () => {
    // "localhost" passes the name check only in dev; with allowPrivate off the DNS answer is checked.
    await expect(
      postWebhook({
        url: 'http://127.0.0.1.nip.io:9/x',
        body: '{}',
        headers: {},
        policy: { allowPrivate: false, requireHttps: false },
        timeoutMs: 3_000,
      }),
    ).rejects.toThrow(/private address|ENOTFOUND|EAI_AGAIN/);
  });
});

describe('postWebhook', () => {
  it('posts the body with the headers and reports status and excerpt', async () => {
    let received: { headers: IncomingHttpHeaders; body: string } | null = null;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        received = { headers: req.headers, body: Buffer.concat(chunks).toString() };
        res.writeHead(202, { 'content-type': 'text/plain' }).end('accepted '.repeat(100));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const result = await postWebhook({
        url: `http://127.0.0.1:${port}/hook`,
        body: '{"id":"1"}',
        headers: { 'x-qualify-signature': 't=1,v1=ab' },
        policy: dev,
      });
      expect(result.status).toBe(202);
      expect(result.excerpt.length).toBe(500);
      expect(received!.body).toBe('{"id":"1"}');
      expect(received!.headers['x-qualify-signature']).toBe('t=1,v1=ab');
      expect(received!.headers['content-type']).toBe('application/json');
      // The same local server is refused when private addresses are not allowed.
      await expect(
        postWebhook({
          url: `http://127.0.0.1:${port}/hook`,
          body: '{}',
          headers: {},
          policy: { allowPrivate: false, requireHttps: false },
        }),
      ).rejects.toThrow('public');
    } finally {
      server.close();
    }
  });
});

// Outbound webhooks: signing, and delivery that refuses private/internal addresses (SSRF).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">` (header X-Qualify-Signature). */
export function signWebhook(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

/** What a receiver does (shown in our docs): check the HMAC and that the timestamp is recent. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  { toleranceSeconds = 300, now = Date.now() }: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((part) => part.split('=', 2) as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1) return false;
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, body, timestamp).split('v1=')[1]!, 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const IPV4_BLOCKED: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10 (CGNAT)
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16 (link-local, cloud metadata)
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0000000, 24], // 192.0.0.0/24
  [0xc0a80000, 16], // 192.168.0.0/16
  [0xc6120000, 15], // 198.18.0.0/15
  [0xe0000000, 3], // 224.0.0.0/3 (multicast, reserved, broadcast)
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const value = ipv4ToInt(ip);
    return IPV4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) >>> 0 === base;
    });
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return (
      lower === '::' ||
      lower === '::1' ||
      /^f[cd]/.test(lower) || // fc00::/7 unique local
      /^fe[89ab]/.test(lower) || // fe80::/10 link-local
      lower.startsWith('ff') // multicast
    );
  }
  return true;
}

export class WebhookUrlError extends Error {}

export interface DeliveryPolicy {
  /** Development may post to localhost; production never may. */
  allowPrivate: boolean;
  requireHttps: boolean;
}

/** Rejects URLs we must never call (wrong scheme, credentials, or a private host). */
export function checkWebhookUrl(raw: string, policy: DeliveryPolicy): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlError('Not a valid URL');
  }
  if (url.protocol !== 'https:' && (policy.requireHttps || url.protocol !== 'http:')) {
    throw new WebhookUrlError('Use an https:// URL');
  }
  if (url.username || url.password) throw new WebhookUrlError('Remove the user name and password');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!policy.allowPrivate) {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
      throw new WebhookUrlError('Use a public address');
    }
    if (isIP(host) && isPrivateAddress(host)) throw new WebhookUrlError('Use a public address');
  }
  return url;
}

export interface DeliveryResult {
  status: number;
  /** First 500 characters of the response body. */
  excerpt: string;
}

/**
 * POSTs the body with our headers. The DNS answer is checked at connect time, so a host that
 * resolves to a private address (or switches to one) is refused. No redirects are followed.
 */
export async function postWebhook(input: {
  url: string;
  body: string;
  headers: Record<string, string>;
  policy: DeliveryPolicy;
  timeoutMs?: number;
}): Promise<DeliveryResult> {
  const url = checkWebhookUrl(input.url, input.policy);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const lookup = (
    hostname: string,
    options: object,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, []);
      const list = addresses as LookupAddress[];
      if (!input.policy.allowPrivate && list.some((entry) => isPrivateAddress(entry.address))) {
        return callback(new WebhookUrlError('The URL resolves to a private address'), []);
      }
      const wantsAll = (options as { all?: boolean }).all;
      if (wantsAll) return callback(null, list);
      const first = list[0];
      if (!first) return callback(new WebhookUrlError('The host has no address'), []);
      return callback(null, first.address, first.family);
    });
  };

  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(input.body).toString(),
          ...input.headers,
        },
        lookup,
        timeout: input.timeoutMs ?? 10_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (size < 2_000) chunks.push(chunk);
          size += chunk.length;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            excerpt: Buffer.concat(chunks).toString('utf8').slice(0, 500),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.end(input.body);
  });
}

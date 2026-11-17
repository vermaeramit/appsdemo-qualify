import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/** Parses ENCRYPTION_MASTER_KEY (base64 or base64url, must decode to exactly 32 bytes). */
export function parseMasterKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes, base64-encoded');
  }
  return key;
}

/** Encrypts a secret (e.g. a tenant's Meta token) as `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Decrypts a value produced by encryptSecret. Throws if it was tampered with. */
export function decryptSecret(encrypted: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = encrypted.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error('Unsupported encrypted secret format');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** WhatsApp sends numbers as digits with country code ("919812345678"). Store them as E.164. */
export function toE164(waId: string): string {
  const digits = waId.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error(`Not a valid WhatsApp number: ${waId}`);
  }
  return `+${digits}`;
}

/** Digits-only form used by the Cloud API `to` field. */
export function toWaId(e164: string): string {
  return e164.replace(/\D/g, '');
}

/**
 * Dev safety switch (D-034): in development the bot may only reply to allow-listed numbers.
 * An empty list means "reply to nobody" (fail safe).
 */
export function isAllowedRecipient(
  waId: string,
  allowlist: readonly string[],
  isProduction: boolean,
): boolean {
  if (isProduction) return true;
  const digits = waId.replace(/\D/g, '');
  return allowlist.some((allowed) => allowed.replace(/\D/g, '') === digits);
}

/** Parses "919812345678, 919800000000" into a clean list. */
export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.replace(/\D/g, ''))
    .filter((part) => part.length > 0);
}

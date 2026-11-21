import { eq, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { smtpSettings } from './schema/email-settings.ts';

export type SmtpSettingsRow = typeof smtpSettings.$inferSelect;

/** The platform's saved SMTP server (D-095); null = none saved (the .env applies). */
export async function getSmtpSettings(db: Database): Promise<SmtpSettingsRow | null> {
  const [row] = await db.select().from(smtpSettings).where(eq(smtpSettings.id, 'platform'));
  return row ?? null;
}

export interface SmtpSettingsInput {
  host: string;
  port: number;
  security: 'starttls' | 'ssl' | 'none';
  username: string | null;
  /** undefined = keep the saved password; null = no password. */
  passwordEnc: string | null | undefined;
  fromName: string;
  fromEmail: string;
  updatedBy: string | null;
}

export async function saveSmtpSettings(
  db: Database,
  input: SmtpSettingsInput,
): Promise<SmtpSettingsRow> {
  const { passwordEnc, ...rest } = input;
  const [row] = await db
    .insert(smtpSettings)
    .values({ id: 'platform', ...rest, passwordEnc: passwordEnc ?? null })
    .onConflictDoUpdate({
      target: smtpSettings.id,
      set: {
        ...rest,
        ...(passwordEnc === undefined ? {} : { passwordEnc }),
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return row!;
}

/** Removes the saved server: the .env settings apply again. */
export async function clearSmtpSettings(db: Database): Promise<void> {
  await db.delete(smtpSettings).where(eq(smtpSettings.id, 'platform'));
}

/** The saved server, re-read at most every `ttlMs` (the worker checks it for every send). */
export function cachedSmtpSettings(
  db: Database,
  ttlMs = 30_000,
): () => Promise<SmtpSettingsRow | null> {
  let cached: { at: number; value: Promise<SmtpSettingsRow | null> } | null = null;
  return () => {
    if (!cached || Date.now() - cached.at > ttlMs) {
      const value = getSmtpSettings(db).catch((error: unknown) => {
        cached = null;
        throw error;
      });
      cached = { at: Date.now(), value };
    }
    return cached.value;
  };
}

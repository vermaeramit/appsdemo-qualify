import { cachedSmtpSettings, type Database } from '@qualify/db';
import {
  createMailer,
  decryptSecret,
  type Mailer,
  resolveMailSettings,
} from '@qualify/integrations';
import type { Logger } from './logger.ts';

/**
 * The mailer for scheduled reports (D-095): the SMTP server a platform admin saved (re-read at
 * most every 30 s, so a change needs no restart), else SMTP_URL / MAIL_FROM, else Mailpit in
 * development. Null when e-mail is off.
 */
export function createMailSource(options: {
  db: Database;
  logger: Pick<Logger, 'warn'>;
  masterKey: Buffer | null;
  production: boolean;
  appName: string;
  smtpUrl: string | undefined;
  mailFrom: string | undefined;
}): () => Promise<Mailer | null> {
  const saved = cachedSmtpSettings(options.db);
  let current: { key: string; mailer: Mailer } | null = null;

  return async () => {
    const row = await saved().catch((error: unknown) => {
      options.logger.warn({ err: error }, 'Could not read the saved SMTP settings');
      return null;
    });
    let password: string | null = null;
    if (row?.passwordEnc) {
      try {
        if (!options.masterKey) throw new Error('ENCRYPTION_MASTER_KEY not set');
        password = decryptSecret(row.passwordEnc, options.masterKey);
      } catch (error) {
        options.logger.warn({ err: error }, "The saved SMTP password can't be read");
        return null;
      }
    }
    const settings = resolveMailSettings({
      production: options.production,
      appName: options.appName,
      smtpUrl: options.smtpUrl,
      mailFrom: options.mailFrom,
      saved: row
        ? {
            host: row.host,
            port: row.port,
            security: row.security,
            username: row.username,
            password,
            fromName: row.fromName,
            fromEmail: row.fromEmail,
          }
        : null,
    });
    if ('off' in settings) return null;
    const key = `${settings.source}|${row?.updatedAt.toISOString() ?? ''}|${settings.from}`;
    if (current?.key !== key) current = { key, mailer: createMailer(settings) };
    return current.mailer;
  };
}

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  clearSmtpSettings,
  type DbHandle,
  getSmtpSettings,
  saveSmtpSettings,
  type SmtpSettingsRow,
} from '@qualify/db';
import {
  createMailer,
  decryptSecret,
  encryptSecret,
  type MailSettings,
  parseMasterKey,
  resolveMailSettings,
  type SavedSmtpServer,
  smtpTransport,
  verifySmtp,
} from '@qualify/integrations';
import type { SaveSmtpSettingsInput, SmtpSettingsView } from '@qualify/shared';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

/**
 * The platform's SMTP server (D-095), set on the admin page: saved only once the server accepts
 * the connection, password encrypted and never shown again. The worker reads the same row.
 */
@Injectable()
export class EmailSettingsService {
  private readonly logger = new Logger(EmailSettingsService.name);
  private readonly masterKey: Buffer | null;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;
  }

  /** What sends e-mail now (the saved server, the .env, Mailpit in development, or nothing). */
  async effective(): Promise<MailSettings> {
    const row = await getSmtpSettings(this.handle.db);
    return this.resolve(row ? this.toServer(row) : null);
  }

  async isConfigured(): Promise<boolean> {
    return !('off' in (await this.effective()));
  }

  async view(testRecipient: string): Promise<SmtpSettingsView> {
    const row = await getSmtpSettings(this.handle.db);
    const settings = this.resolve(row ? this.toServer(row) : null);
    return {
      source: 'off' in settings ? 'off' : settings.source,
      saved: row
        ? {
            host: row.host,
            port: row.port,
            security: row.security,
            username: row.username ?? '',
            passwordSet: row.passwordEnc !== null,
            fromName: row.fromName,
            fromEmail: row.fromEmail,
            updatedAt: row.updatedAt.toISOString(),
            updatedBy: row.updatedBy,
          }
        : null,
      testRecipient,
    };
  }

  /** Checks the connection and login with the server, then saves. */
  async save(input: SaveSmtpSettingsInput, adminName: string): Promise<void> {
    if (!this.masterKey) {
      throw new ServiceUnavailableException(
        'Saving SMTP needs ENCRYPTION_MASTER_KEY on the server',
      );
    }
    const current = await getSmtpSettings(this.handle.db);
    const typed = input.password?.length ? input.password : undefined;
    const username = input.username.trim() || null;
    // Keep the saved password when the field is left empty (and a login is still used).
    const password = !username ? null : (typed ?? this.savedPassword(current));
    const server: SavedSmtpServer = {
      host: input.host,
      port: input.port,
      security: input.security,
      username,
      password,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
    };
    const check = await verifySmtp(smtpTransport(server));
    if (!check.ok) {
      throw new BadRequestException(`The SMTP server refused the connection: ${check.message}`);
    }
    await saveSmtpSettings(this.handle.db, {
      host: server.host,
      port: server.port,
      security: server.security,
      username,
      passwordEnc: !username
        ? null
        : typed !== undefined
          ? encryptSecret(typed, this.masterKey)
          : undefined,
      fromName: server.fromName,
      fromEmail: server.fromEmail,
      updatedBy: adminName,
    });
    this.logger.log(`SMTP settings saved by ${adminName} (${server.host}:${server.port})`);
  }

  async clear(adminName: string): Promise<void> {
    await clearSmtpSettings(this.handle.db);
    this.logger.log(`SMTP settings removed by ${adminName}: the server's .env applies`);
  }

  /** Sends a short test e-mail through whatever sends e-mail now. */
  async sendTest(to: string): Promise<{ source: string }> {
    const settings = await this.effective();
    if ('off' in settings) throw new BadRequestException(settings.off);
    try {
      await createMailer(settings).send({
        to: [to],
        subject: `${this.env.APP_NAME}: test e-mail`,
        text: `This is a test e-mail from ${this.env.APP_NAME}. Scheduled reports will be sent the same way.`,
        html: `<p>This is a test e-mail from <strong>${escapeHtml(this.env.APP_NAME)}</strong>.</p><p>Scheduled reports will be sent the same way.</p>`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`The test e-mail was not sent: ${message.slice(0, 300)}`);
    }
    return { source: settings.source };
  }

  private resolve(saved: SavedSmtpServer | null): MailSettings {
    return resolveMailSettings({
      production: this.env.NODE_ENV === 'production',
      appName: this.env.APP_NAME,
      smtpUrl: this.env.SMTP_URL,
      mailFrom: this.env.MAIL_FROM,
      saved,
    });
  }

  private savedPassword(row: SmtpSettingsRow | null): string | null {
    if (!row?.passwordEnc || !this.masterKey) return null;
    try {
      return decryptSecret(row.passwordEnc, this.masterKey);
    } catch {
      return null;
    }
  }

  private toServer(row: SmtpSettingsRow): SavedSmtpServer {
    return {
      host: row.host,
      port: row.port,
      security: row.security,
      username: row.username,
      password: this.savedPassword(row),
      fromName: row.fromName,
      fromEmail: row.fromEmail,
    };
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

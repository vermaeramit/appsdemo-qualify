import nodemailer, { type TransportOptions } from 'nodemailer';

/** An e-mail the app sends (scheduled reports, D-088). */
export interface OutgoingEmail {
  to: readonly string[];
  subject: string;
  html: string;
  text: string;
  attachments?: readonly { filename: string; content: Buffer; contentType: string }[];
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<{ messageId: string }>;
}

/** A nodemailer transport: SMTP options, or a test transport. */
export type MailTransport = TransportOptions | Record<string, unknown>;

/** The SMTP server a platform admin saved (D-095), password already decrypted. */
export interface SavedSmtpServer {
  host: string;
  port: number;
  security: 'starttls' | 'ssl' | 'none';
  username: string | null;
  password: string | null;
  fromName: string;
  fromEmail: string;
}

export type MailSettings =
  { source: 'admin' | 'env' | 'dev'; from: string; transport: MailTransport } | { off: string };

const TIMEOUTS = { connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 60_000 };

/** nodemailer SMTP options for a saved server: SSL on connect, STARTTLS required, or plain. */
export function smtpTransport(server: SavedSmtpServer): MailTransport {
  return {
    host: server.host,
    port: server.port,
    secure: server.security === 'ssl',
    requireTLS: server.security === 'starttls',
    ignoreTLS: server.security === 'none',
    ...(server.username ? { auth: { user: server.username, pass: server.password ?? '' } } : {}),
    ...TIMEOUTS,
  };
}

/** `"Qualify Reports" <reports@example.com>` (the name quoted, so commas are safe). */
export function formatSender(name: string, address: string): string {
  return `"${name.replace(/["\\]/g, '')}" <${address}>`;
}

/**
 * Which SMTP server sends e-mail (D-095): the one a platform admin saved, else SMTP_URL and
 * MAIL_FROM from the environment, else Mailpit (smtp://localhost:1025) outside production, so
 * nothing leaves a developer's machine. Otherwise e-mail is off, with the reason.
 */
export function resolveMailSettings(input: {
  production: boolean;
  appName: string;
  smtpUrl: string | undefined;
  mailFrom: string | undefined;
  saved?: SavedSmtpServer | null;
}): MailSettings {
  if (input.saved) {
    return {
      source: 'admin',
      from: formatSender(input.saved.fromName, input.saved.fromEmail),
      transport: smtpTransport(input.saved),
    };
  }
  if (input.smtpUrl) {
    if (!input.mailFrom && input.production) {
      return { off: 'MAIL_FROM not set: scheduled reports are not sent' };
    }
    return {
      source: 'env',
      from: input.mailFrom ?? `${input.appName} <reports@localhost>`,
      transport: { url: input.smtpUrl, ...TIMEOUTS },
    };
  }
  if (!input.production) {
    return {
      source: 'dev',
      from: input.mailFrom ?? `${input.appName} <reports@localhost>`,
      transport: { url: 'smtp://localhost:1025', ...TIMEOUTS },
    };
  }
  return {
    off: 'No SMTP server set (Platform admin → Email, or SMTP_URL): scheduled reports are not sent',
  };
}

/**
 * Sends through SMTP, so the provider (Brevo, ZeptoMail, Amazon SES, Mailpit in development) is a
 * configuration choice. `from` is the sender, e.g. `"Reports" <reports@example.com>`.
 */
export function createMailer(options: { transport: MailTransport; from: string }): Mailer {
  const transporter = nodemailer.createTransport(options.transport);
  return {
    async send(email) {
      const info = (await transporter.sendMail({
        from: options.from,
        to: [...email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments?.map((file) => ({ ...file })),
      })) as { messageId?: string };
      return { messageId: info.messageId ?? '' };
    },
  };
}

/** Connects and logs in to check an SMTP server, without sending anything. */
export async function verifySmtp(
  transport: MailTransport,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await nodemailer.createTransport(transport).verify();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: message.slice(0, 300) };
  }
}

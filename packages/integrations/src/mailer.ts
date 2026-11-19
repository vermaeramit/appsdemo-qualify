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

/**
 * SMTP settings from the environment, or why e-mail is off. Outside production it defaults to
 * Mailpit from compose.yaml (smtp://localhost:1025), so nothing leaves a developer's machine.
 */
export function resolveMailSettings(input: {
  production: boolean;
  appName: string;
  smtpUrl: string | undefined;
  mailFrom: string | undefined;
}): { url: string; from: string } | { off: string } {
  const url = input.smtpUrl ?? (input.production ? undefined : 'smtp://localhost:1025');
  if (!url) return { off: 'SMTP_URL not set: scheduled reports are not sent' };
  const from =
    input.mailFrom ?? (input.production ? undefined : `${input.appName} <reports@localhost>`);
  if (!from) return { off: 'MAIL_FROM not set: scheduled reports are not sent' };
  return { url, from };
}

/**
 * Sends through SMTP, so the provider (Brevo, ZeptoMail, Amazon SES, Mailpit in development) is a
 * configuration choice: `SMTP_URL` such as `smtp://user:pass@smtp-relay.example.com:587`
 * (STARTTLS) or `smtps://…:465`. `from` is the sender, e.g. `Reports <reports@example.com>`.
 * `transport` replaces SMTP in tests.
 */
export function createMailer(options: {
  url?: string;
  from: string;
  transport?: TransportOptions | Record<string, unknown>;
}): Mailer {
  const transporter = nodemailer.createTransport(
    options.transport ?? {
      url: options.url,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    },
  );
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

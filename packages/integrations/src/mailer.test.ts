import { describe, expect, it } from 'vitest';
import { createMailer, resolveMailSettings, smtpTransport, verifySmtp } from './mailer.ts';

interface CapturedMail {
  message: { createReadStream(): NodeJS.ReadableStream; messageId(): string };
}

describe('createMailer', () => {
  it('builds one MIME message with every recipient, both bodies and the attachment', async () => {
    let raw = '';
    // A transport that keeps the composed message instead of sending it.
    const mailer = createMailer({
      from: 'Reports <reports@example.com>',
      transport: {
        name: 'capture',
        version: '1',
        send(mail: CapturedMail, done: (error: Error | null, info: unknown) => void) {
          const chunks: Buffer[] = [];
          const stream = mail.message.createReadStream();
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            raw = Buffer.concat(chunks).toString();
            done(null, { messageId: mail.message.messageId() });
          });
        },
      },
    });
    const result = await mailer.send({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Daily report: 3 leads',
      html: '<p>Hello</p>',
      text: 'Hello',
      attachments: [
        {
          filename: 'leads.xlsx',
          content: Buffer.from('xlsx bytes'),
          contentType: 'application/octet-stream',
        },
      ],
    });
    expect(result.messageId).toMatch(/@/);
    expect(raw).toContain('From: Reports <reports@example.com>');
    expect(raw).toContain('To: a@example.com, b@example.com');
    expect(raw).toContain('Subject: Daily report: 3 leads');
    expect(raw).toContain('text/plain');
    expect(raw).toContain('text/html');
    expect(raw).toContain('filename=leads.xlsx');
  });
});

describe('resolveMailSettings (D-095)', () => {
  const saved = {
    host: 'smtp-relay.example.com',
    port: 587,
    security: 'starttls' as const,
    username: 'apikey',
    password: 'secret',
    fromName: 'Qualify, Reports',
    fromEmail: 'reports@example.com',
  };

  it("prefers the admin's saved server, with STARTTLS required and a quoted sender", () => {
    const settings = resolveMailSettings({
      production: true,
      appName: 'Qualify',
      smtpUrl: 'smtp://env.example.com:587',
      mailFrom: 'Env <env@example.com>',
      saved,
    });
    expect(settings).toEqual({
      source: 'admin',
      from: '"Qualify, Reports" <reports@example.com>',
      transport: expect.objectContaining({
        host: 'smtp-relay.example.com',
        port: 587,
        secure: false,
        requireTLS: true,
        ignoreTLS: false,
        auth: { user: 'apikey', pass: 'secret' },
      }),
    });
  });

  it('uses SSL on connect for port 465 style servers and no login without a username', () => {
    expect(smtpTransport({ ...saved, security: 'ssl', port: 465, username: null })).toEqual(
      expect.objectContaining({ secure: true, requireTLS: false }),
    );
    expect(smtpTransport({ ...saved, username: null })).not.toHaveProperty('auth');
  });

  it('falls back to the .env, then Mailpit in development, else off in production', () => {
    expect(
      resolveMailSettings({
        production: true,
        appName: 'Qualify',
        smtpUrl: 'smtp://env.example.com:587',
        mailFrom: 'Env <env@example.com>',
      }),
    ).toMatchObject({ source: 'env', from: 'Env <env@example.com>' });
    expect(
      resolveMailSettings({
        production: false,
        appName: 'Qualify',
        smtpUrl: undefined,
        mailFrom: undefined,
      }),
    ).toMatchObject({ source: 'dev', transport: { url: 'smtp://localhost:1025' } });
    expect(
      resolveMailSettings({
        production: true,
        appName: 'Qualify',
        smtpUrl: undefined,
        mailFrom: undefined,
      }),
    ).toEqual({ off: expect.stringContaining('Platform admin → Email') });
    expect(
      resolveMailSettings({
        production: true,
        appName: 'Qualify',
        smtpUrl: 'smtp://x:587',
        mailFrom: undefined,
      }),
    ).toEqual({ off: expect.stringContaining('MAIL_FROM') });
  });

  it('reports a server it cannot reach instead of throwing', async () => {
    const result = await verifySmtp({ host: '127.0.0.1', port: 1, connectionTimeout: 2_000 });
    expect(result).toMatchObject({ ok: false });
  });
});

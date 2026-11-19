import { describe, expect, it } from 'vitest';
import { createMailer } from './mailer.ts';

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

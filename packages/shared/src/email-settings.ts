import { z } from 'zod';
import { emailSchema } from './auth.js';

/**
 * The platform's SMTP server for the e-mails it sends (scheduled reports), set by a platform
 * admin (D-095). Takes precedence over SMTP_URL / MAIL_FROM in the server's .env.
 */
export const smtpSecuritySchema = z.enum(['starttls', 'ssl', 'none']);
export type SmtpSecurity = z.infer<typeof smtpSecuritySchema>;

/** PUT /api/admin/email (the connection is checked before saving). */
export const saveSmtpSettingsSchema = z.object({
  host: z
    .string()
    .trim()
    .min(3, 'Enter the SMTP server')
    .max(200)
    .regex(/^[a-z0-9.-]+$/i, 'Use the server name only, e.g. smtp-relay.brevo.com'),
  port: z.number().int().min(1).max(65_535),
  security: smtpSecuritySchema,
  /** Empty = the server needs no login. */
  username: z.string().trim().max(200),
  /** Empty or left out = keep the saved password. */
  password: z.string().max(500).optional(),
  fromName: z.string().trim().min(1, 'Enter the sender name').max(100),
  fromEmail: emailSchema,
});
export type SaveSmtpSettingsInput = z.infer<typeof saveSmtpSettingsSchema>;

/** GET /api/admin/email: what sends e-mail now, and the saved settings (never the password). */
export const smtpSettingsViewSchema = z.object({
  /** admin = these settings; env = the server's .env; dev = Mailpit in development; off = none. */
  source: z.enum(['admin', 'env', 'dev', 'off']),
  saved: z
    .object({
      host: z.string(),
      port: z.number().int(),
      security: smtpSecuritySchema,
      username: z.string(),
      passwordSet: z.boolean(),
      fromName: z.string(),
      fromEmail: z.string(),
      updatedAt: z.iso.datetime(),
      updatedBy: z.string().nullable(),
    })
    .nullable(),
  /** The address a test e-mail goes to by default (the admin's own). */
  testRecipient: z.string(),
});
export type SmtpSettingsView = z.infer<typeof smtpSettingsViewSchema>;

/** POST /api/admin/email/test */
export const sendTestEmailSchema = z.object({ to: emailSchema.optional() });

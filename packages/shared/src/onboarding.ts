import { z } from 'zod';

/** GET /api/whatsapp/onboarding/config — what the browser needs to open Embedded Signup. */
export const signupConfigSchema = z.object({
  /** False until META_APP_ID and META_ES_CONFIG_ID are set on the server. */
  enabled: z.boolean(),
  appId: z.string().nullable(),
  configId: z.string().nullable(),
  graphVersion: z.string(),
});
export type SignupConfig = z.infer<typeof signupConfigSchema>;

/**
 * POST /api/whatsapp/onboarding/complete — after the customer finishes Embedded Signup.
 * `coexistence` = their WhatsApp Business app number (keeps working in the app; no register);
 * `cloud` = a number only on the API (registered with a 6-digit PIN).
 */
export const completeSignupSchema = z
  .object({
    code: z.string().min(10).max(2_000),
    mode: z.enum(['coexistence', 'cloud']),
    wabaId: z.string().regex(/^\d{5,25}$/),
    phoneNumberId: z
      .string()
      .regex(/^\d{5,25}$/)
      .optional(),
    pin: z
      .string()
      .regex(/^\d{6}$/, 'Use 6 digits')
      .optional(),
  })
  .refine((input) => input.mode !== 'cloud' || input.pin, {
    message: 'Choose a 6-digit PIN for the number',
    path: ['pin'],
  });
export type CompleteSignup = z.infer<typeof completeSignupSchema>;

export const signupResultSchema = z.object({
  phoneNumberId: z.string(),
  displayPhone: z.string(),
  verifiedName: z.string().nullable(),
  mode: z.enum(['coexistence', 'cloud']),
  /** Each onboarding step and whether it worked (sync failures don't block the connection). */
  steps: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().nullable() })),
});
export type SignupResult = z.infer<typeof signupResultSchema>;

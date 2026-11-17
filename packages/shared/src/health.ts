import { z } from 'zod';

/** Response of GET /api/health. Used by the api (to build it) and the web app (to parse it). */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
  version: z.string().min(1),
  time: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Validates a request body with a shared Zod schema; 400 with readable issues on failure. */
export function parseBody<SCHEMA extends z.ZodType>(
  schema: SCHEMA,
  body: unknown,
): z.infer<SCHEMA> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid request body',
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(body)',
        message: issue.message,
      })),
    });
  }
  return result.data;
}

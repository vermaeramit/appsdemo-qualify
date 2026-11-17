import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    base: { service: 'worker' },
    transport: pretty
      ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  });
}

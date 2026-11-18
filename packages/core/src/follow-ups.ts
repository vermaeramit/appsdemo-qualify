import type { PlaybookConfig, PlaybookFollowUps } from '@qualify/shared';
import { messageTemplateName } from './opening.ts';

const HOUR_MS = 3_600_000;

/** Defaults: 2 follow-ups (3 h and 24 h), "No reply" 48 h later, quiet 21:00–09:00 IST. */
export function defaultFollowUps(): PlaybookFollowUps {
  return {
    enabled: true,
    steps: [{ afterHours: 3 }, { afterHours: 24 }],
    unresponsiveAfterHours: 48,
    quietHours: { start: 21, end: 9 },
    timezone: 'Asia/Kolkata',
    template: {
      templateName: null,
      templateLanguage: 'en',
      bodyText:
        "Hi {{1}}, just checking in 😊 Are you still interested? Reply here and we'll help you right away.",
      bodyParams: ['lead.firstName'],
      buttons: ['Yes, interested', 'Not now'],
    },
  };
}

export function resolveFollowUps(config: PlaybookConfig): PlaybookFollowUps {
  return config.followUps ?? defaultFollowUps();
}

/** Template name for a follow-up text (a changed text gets its own Meta approval). */
export function followUpTemplateName(template: PlaybookFollowUps['template']): string {
  return messageTemplateName('qualify_followup', template);
}

/** Local hour and minute of an instant in a time zone. */
function localTime(instant: Date, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: value('hour'), minute: value('minute') };
}

/**
 * The first moment at or after `due` outside quiet hours (start → end, may cross midnight).
 * Equal start and end means no quiet hours.
 */
export function outsideQuietHours(
  due: Date,
  quietHours: PlaybookFollowUps['quietHours'],
  timeZone: string,
): Date {
  const { start, end } = quietHours;
  if (start === end) return due;
  const { hour, minute } = localTime(due, timeZone);
  const quiet = start < end ? hour >= start && hour < end : hour >= start || hour < end;
  if (!quiet) return due;
  const minutesNow = hour * 60 + minute;
  const minutesToEnd = (end * 60 - minutesNow + 24 * 60) % (24 * 60);
  const shifted = new Date(due.getTime() + minutesToEnd * 60_000);
  shifted.setUTCSeconds(0, 0);
  return shifted;
}

export interface PlannedFollowUp {
  kind: 'followup' | 'unresponsive';
  step: number;
  dueAt: Date;
}

/**
 * What comes after `sent` follow-ups (counted since the lead's last message), measured from
 * our last message at `from`: the next follow-up, the final "No reply" check, or nothing.
 */
export function planNextFollowUp(
  settings: PlaybookFollowUps,
  sent: number,
  from: Date,
): PlannedFollowUp | null {
  if (!settings.enabled) return null;
  const step = settings.steps[sent];
  if (step) {
    const due = new Date(from.getTime() + step.afterHours * HOUR_MS);
    return {
      kind: 'followup',
      step: sent,
      dueAt: outsideQuietHours(due, settings.quietHours, settings.timezone),
    };
  }
  return {
    kind: 'unresponsive',
    step: sent,
    dueAt: new Date(from.getTime() + settings.unresponsiveAfterHours * HOUR_MS),
  };
}

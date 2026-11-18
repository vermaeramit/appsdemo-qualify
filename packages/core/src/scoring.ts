import type {
  LeadGrade,
  LeadScoreDetails,
  LeadSignals,
  PlaybookConfig,
  PlaybookField,
  PlaybookScoring,
} from '@qualify/shared';
import { type LeadFields, missingRequiredFields } from './fields.ts';

/**
 * Default for playbooks without a scoring section: completeness + AI intent. Industry templates
 * (see templates/) carry their own rules.
 */
export function defaultScoring(_fields: readonly PlaybookField[]): PlaybookScoring {
  return { rules: [], completePoints: 70, aiMaxPoints: 30, hotAt: 80, warmAt: 50 };
}

export function resolveScoring(config: PlaybookConfig): PlaybookScoring {
  return config.scoring ?? defaultScoring(config.fields);
}

const UNITS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  l: 100_000,
  lac: 100_000,
  lacs: 100_000,
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
};

/** Lowest amount in a text: "60000-70000 INR total" → 60000, "₹50k–1L" → 50000, "1.5 lakh" → 150000. */
export function parseAmount(text: string): number | null {
  const cleaned = text.toLowerCase().replace(/(\d),(?=\d)/g, '$1');
  const values = [
    ...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(k|thousand|lacs|lac|lakhs|lakh|crore|cr|l)?\b/g),
  ]
    .map(([, number, unit]) => Number(number) * (unit ? (UNITS[unit] ?? 1) : 1))
    .filter((value) => value > 0);
  return values.length ? Math.min(...values) : null;
}

const PERSON_WORDS =
  /(\d+)\s*(?:adults?|kids?|child(?:ren)?|infants?|people|persons?|pax|members?|travell?ers?|log|bacche|guests?)\b/gi;

/** How many people a text names: "2 adults, 1 child (5 yrs)" → 3; "couple" → 2; "4" → 4. */
export function countPeople(text: string): number | null {
  const counted = [...text.matchAll(PERSON_WORDS)].reduce(
    (sum, match) => sum + Number(match[1]),
    0,
  );
  if (counted > 0) return counted;
  if (/\bcouple\b/i.test(text)) return 2;
  const numbers = text.match(/\d+/g);
  return numbers?.length === 1 ? Number(numbers[0]) : null;
}

/** Months from today's month to a "YYYY-MM" answer; null for "flexible" or anything else. */
export function monthsAhead(value: string, today: string): number | null {
  const answer = /^(\d{4})-(\d{2})$/.exec(value);
  const now = /^(\d{4})-(\d{2})/.exec(today);
  if (!answer || !now) return null;
  return Number(answer[1]) * 12 + Number(answer[2]) - (Number(now[1]) * 12 + Number(now[2]));
}

const MONTH_BANDS = ['within 1 month', 'within 3 months', 'within 6 months', 'later or flexible'];

function monthBand(months: number | null): number {
  if (months === null || months < 0) return 3;
  if (months <= 1) return 0;
  if (months <= 3) return 1;
  if (months <= 6) return 2;
  return 3;
}

const amounts = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export interface ScoreInput {
  definitions: readonly PlaybookField[];
  scoring: PlaybookScoring;
  fields: LeadFields;
  signals: LeadSignals | null;
  status: string;
  /** "YYYY-MM-DD" in the business's time zone. */
  today: string;
}

export interface LeadScoreResult {
  score: number;
  grade: LeadGrade;
  details: Omit<LeadScoreDetails, 'final'>;
}

/** Rule points from the answers + AI intent points, graded by the thresholds (FR-7). */
export function scoreLead(input: ScoreInput): LeadScoreResult {
  const byKey = new Map(input.definitions.map((field) => [field.key, field]));
  const breakdown: LeadScoreDetails['breakdown'] = [];

  for (const rule of input.scoring.rules) {
    const field = byKey.get(rule.field);
    const value = input.fields[rule.field];
    if (!field || !value) continue;

    if ((field.type === 'choice' || field.type === 'yes_no') && rule.options) {
      const key = Object.keys(rule.options).find(
        (option) => option.toLowerCase() === value.toLowerCase(),
      );
      breakdown.push({
        label: `${field.label}: ${value}`,
        points: key ? (rule.options[key] ?? 0) : 0,
      });
    } else if (field.type === 'date_month' && rule.months) {
      const band = monthBand(monthsAhead(value, input.today));
      breakdown.push({
        label: `${field.label}: ${value} (${MONTH_BANDS[band]})`,
        points: rule.months[band] ?? 0,
      });
    } else if ((field.type === 'range' || field.type === 'number') && rule.amounts) {
      let amount = parseAmount(value);
      let note = '';
      const people = rule.perPersonField
        ? countPeople(input.fields[rule.perPersonField] ?? '')
        : null;
      if (amount !== null && people && /total/i.test(value)) {
        amount = Math.round(amount / people);
        note = ` (≈ ${amounts.format(amount)} each)`;
      }
      const band =
        amount === null
          ? undefined
          : [...rule.amounts].sort((a, b) => b.min - a.min).find((entry) => amount >= entry.min);
      breakdown.push({ label: `${field.label}: ${value}${note}`, points: band?.points ?? 0 });
    } else if (rule.points !== undefined) {
      breakdown.push({ label: `${field.label} given`, points: rule.points });
    }
  }

  if (input.scoring.completePoints > 0) {
    const complete = missingRequiredFields(input.definitions, input.fields).length === 0;
    if (complete)
      breakdown.push({ label: 'All required answers', points: input.scoring.completePoints });
  }
  const rulePoints = breakdown.reduce((sum, item) => sum + item.points, 0);

  let aiPoints = 0;
  if (input.signals && input.scoring.aiMaxPoints > 0) {
    const { urgency, seriousness, buyingSignals } = input.signals;
    aiPoints = Math.round(
      ((urgency + seriousness + buyingSignals) / 30) * input.scoring.aiMaxPoints,
    );
    breakdown.push({
      label: `AI intent (urgency ${urgency}, seriousness ${seriousness}, buying signals ${buyingSignals})`,
      points: aiPoints,
    });
  }

  const score = Math.max(0, Math.min(100, rulePoints + aiPoints));
  const grade: LeadGrade =
    input.status === 'disqualified'
      ? 'disqualified'
      : score >= input.scoring.hotAt
        ? 'hot'
        : score >= input.scoring.warmAt
          ? 'warm'
          : 'cold';
  const reason =
    breakdown
      .filter((item) => item.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((item) => `${item.label} +${item.points}`)
      .join(' · ') || 'No scoring answers yet';

  return { score, grade, details: { breakdown, rulePoints, aiPoints, reason } };
}

/** Highest rule points the configuration can give (to show "out of" in the editor). */
export function maxRulePoints(scoring: PlaybookScoring): number {
  return (
    scoring.rules.reduce((sum, rule) => {
      const candidates = [
        rule.points ?? 0,
        ...Object.values(rule.options ?? {}),
        ...(rule.months ?? []),
        ...(rule.amounts ?? []).map((entry) => entry.points),
      ];
      return sum + Math.max(0, ...candidates);
    }, 0) + scoring.completePoints
  );
}

/** The score columns stored on a lead (keeps the summary's usage record across rescoring). */
export function leadScoreColumns(input: {
  config: PlaybookConfig;
  fields: LeadFields;
  signals: LeadSignals | null;
  status: string;
  /** "YYYY-MM-DD" in the business's time zone. */
  today: string;
  final: boolean;
  now: Date;
  previous?: LeadScoreDetails | null;
}): {
  score: number;
  grade: LeadGrade;
  scoreDetails: LeadScoreDetails;
  scoredAt: Date;
} {
  const result = scoreLead({
    definitions: input.config.fields,
    scoring: resolveScoring(input.config),
    fields: input.fields,
    signals: input.signals,
    status: input.status,
    today: input.today,
  });
  return {
    score: result.score,
    grade: result.grade,
    scoreDetails: {
      ...result.details,
      final: input.final,
      ...(input.previous?.summaryUsage ? { summaryUsage: input.previous.summaryUsage } : {}),
    },
    scoredAt: input.now,
  };
}

/** Today's date ("YYYY-MM-DD") in a time zone. */
export function localToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(now);
}

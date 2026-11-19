import type { AgentTurn, PlaybookField } from '@qualify/shared';
import { describe, expect, it } from 'vitest';
import { answersToConfirm, mergeUnconfirmed } from './prefill.ts';
import { buildStateNote, buildSystemPrompt } from './prompt.ts';
import { generalPlaybookTemplate } from './templates/general.ts';
import { applyAgentTurn } from './turn.ts';

// D-089: answers that came with the lead (form / API) are confirmed in the chat.
const fields: PlaybookField[] = [
  { key: 'destination', label: 'Destination', type: 'text', required: true, priority: 1 },
  {
    key: 'travel_month',
    label: 'Travel month',
    type: 'date_month',
    required: true,
    priority: 2,
  },
  {
    key: 'passport',
    label: 'Passport',
    type: 'yes_no',
    required: false,
    priority: 3,
  },
  {
    key: 'budget',
    label: 'Budget',
    type: 'text',
    required: false,
    priority: 4,
    confirmWhenPrefilled: true,
  },
];
const prefilled = { destination: 'Dubai', travel_month: '2026-12', passport: 'yes' };
const unconfirmed = ['destination', 'travel_month', 'passport'];

const turn = (overrides: Partial<AgentTurn> = {}): AgentTurn => ({
  language: 'hinglish',
  reply: 'Aapne bataya tha Dubai, December. Sahi hai?',
  quickReplies: [],
  askingField: null,
  extracted: [],
  confirming: [],
  confirmed: [],
  signals: { urgency: 5, seriousness: 5, buyingSignals: 3, note: '' },
  handoff: { requested: false, reason: null },
  disqualified: { value: false, reason: null },
  ...overrides,
});

describe('answersToConfirm', () => {
  it('lists answered questions marked for confirmation, in question order', () => {
    // Optional "passport" isn't confirmed by default; "budget" opts in but has no answer.
    expect(answersToConfirm(fields, prefilled, unconfirmed, 'together').map((f) => f.key)).toEqual([
      'destination',
      'travel_month',
    ]);
    expect(
      answersToConfirm(
        fields,
        { ...prefilled, budget: '1 lakh' },
        [...unconfirmed, 'budget'],
        'one_by_one',
      ).map((f) => f.key),
    ).toEqual(['destination', 'travel_month', 'budget']);
    expect(answersToConfirm(fields, prefilled, unconfirmed, 'off')).toEqual([]);
    const optedOut = fields.map((f) =>
      f.key === 'destination' ? { ...f, confirmWhenPrefilled: false } : f,
    );
    expect(
      answersToConfirm(optedOut, prefilled, unconfirmed, 'together').map((f) => f.key),
    ).toEqual(['travel_month']);
  });

  it('adds the keys of every answer that came with an enquiry', () => {
    expect(mergeUnconfirmed(['destination'], { travel_month: '2026-12', budget: '' })).toEqual([
      'destination',
      'travel_month',
    ]);
  });
});

describe('prompt and state note', () => {
  const config = generalPlaybookTemplate('Acme');

  it('explains confirmation in the system prompt unless it is off', () => {
    expect(
      buildSystemPrompt(config, { allowedLanguages: ['en'], defaultLanguage: 'en' }),
    ).toContain('Confirm ALL of them in ONE short message');
    const oneByOne = buildSystemPrompt(
      { ...config, prefillConfirmation: 'one_by_one' },
      { allowedLanguages: ['en'], defaultLanguage: 'en' },
    );
    expect(oneByOne).toContain('Confirm them ONE at a time');
    const off = buildSystemPrompt(
      { ...config, prefillConfirmation: 'off' },
      { allowedLanguages: ['en'], defaultLanguage: 'en' },
    );
    expect(off).not.toContain('# Answers that came with the lead');
  });

  it('lists the answers to confirm and holds the closing until they are confirmed', () => {
    const note = buildStateNote({
      today: '2026-11-19',
      fields: prefilled,
      definitions: fields,
      status: 'contacting',
      leadName: 'Neha',
      unconfirmed,
      confirmMode: 'together',
    });
    expect(note).toContain(
      'Answers to confirm (came with the lead, not confirmed yet): destination=Dubai; travel_month=2026-12',
    );
    expect(note).toContain('Missing required fields (ask in this order): none');
    expect(note).toContain('only the answers to confirm are left');
    const off = buildStateNote({
      today: '2026-11-19',
      fields: prefilled,
      definitions: fields,
      status: 'contacting',
      leadName: 'Neha',
      unconfirmed,
      confirmMode: 'off',
    });
    expect(off).not.toContain('Answers to confirm');
    expect(off).toContain('Qualification complete: YES');
  });
});

describe('applyAgentTurn with answers to confirm', () => {
  const lead = { fields: prefilled, status: 'contacting', unconfirmed };

  it('asks to confirm with "Yes, correct / Change something" and does not close yet', () => {
    const applied = applyAgentTurn(
      fields,
      lead,
      turn({ confirming: ['destination', 'travel_month'] }),
      'hinglish',
      'together',
    );
    expect(applied.status).toBe('engaged');
    expect(applied.options).toEqual({
      kind: 'buttons',
      buttons: ['Haan, sahi hai', 'Kuch badalna hai'],
    });
    expect(applied.unconfirmed).toEqual(unconfirmed);
  });

  it('closes once the lead confirms, keeping only what still waits', () => {
    const applied = applyAgentTurn(
      fields,
      { ...lead, status: 'engaged' },
      turn({ confirmed: ['destination', 'travel_month'], reply: 'Thank you!' }),
      'en',
      'together',
    );
    expect(applied.status).toBe('qualified');
    expect(applied.becameQualified).toBe(true);
    expect(applied.confirmed).toEqual(['destination', 'travel_month']);
    expect(applied.unconfirmed).toEqual(['passport']);
  });

  it('treats a corrected value as confirmed', () => {
    const applied = applyAgentTurn(
      fields,
      { ...lead, status: 'engaged' },
      turn({ extracted: [{ key: 'travel_month', value: '2027-01' }] }),
      'en',
      'together',
    );
    expect(applied.fields.travel_month).toBe('2027-01');
    expect(applied.unconfirmed).toEqual(['destination', 'passport']);
    expect(applied.status).toBe('engaged');
  });

  it('uses Yes/No for one answer at a time, and ignores keys that need no confirmation', () => {
    const one = applyAgentTurn(
      fields,
      lead,
      turn({ confirming: ['destination'] }),
      'en',
      'one_by_one',
    );
    expect(one.options).toEqual({ kind: 'buttons', buttons: ['Yes', 'No'] });
    const notPending = applyAgentTurn(
      fields,
      lead,
      turn({ confirming: ['budget'] }),
      'en',
      'together',
    );
    expect(notPending.options).toEqual({ kind: 'none' });
  });

  it('closes right away when confirmation is off', () => {
    const applied = applyAgentTurn(fields, lead, turn(), 'en', 'off');
    expect(applied.status).toBe('qualified');
  });
});

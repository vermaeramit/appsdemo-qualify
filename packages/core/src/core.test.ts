import { playbookConfigSchema } from '@qualify/shared';
import { describe, expect, it } from 'vitest';
import {
  aiCostUsd,
  applyAgentTurn,
  countPeople,
  defaultScoring,
  maxRulePoints,
  monthsAhead,
  parseAmount,
  resolveScoring,
  scoreLead,
  defaultFollowUps,
  followUpTemplateName,
  outsideQuietHours,
  planNextFollowUp,
  chooseReplyOptions,
  openingExampleParams,
  openingTemplateName,
  renderOpening,
  resolveOpening,
  resolveParam,
  chooseReplyLanguage,
  detectLanguage,
  buildStateNote,
  buildSystemPrompt,
  clampSignal,
  isQualificationComplete,
  isServiceWindowOpen,
  mergeExtractedFields,
  missingRequiredFields,
  sanitizeQuickReplies,
  toModelHistory,
  travelPlaybookTemplate,
} from './index.ts';

const playbook = travelPlaybookTemplate('Sunrise Holidays');
const fields = playbook.fields;

describe('aiCostUsd', () => {
  it('prices cached input separately and knows dated model snapshots', () => {
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000 };
    // 600k × 0.75 + 400k × 0.075 + 100k × 4.5 per 1M = 0.45 + 0.03 + 0.45
    expect(aiCostUsd({ model: 'gpt-5.4-mini', ...usage })).toBeCloseTo(0.93, 6);
    expect(aiCostUsd({ model: 'gpt-5.4-mini-2026-03-05', ...usage })).toBeCloseTo(0.93, 6);
    expect(aiCostUsd({ model: 'unknown-model', ...usage })).toBeNull();
  });
});

describe('follow-ups', () => {
  const settings = defaultFollowUps();
  const ist = (iso: string) => new Date(`${iso}+05:30`);

  it('moves a follow-up due in quiet hours to the end of them', () => {
    const quiet = { start: 21, end: 9 };
    expect(outsideQuietHours(ist('2026-11-18T15:00:00'), quiet, 'Asia/Kolkata')).toEqual(
      ist('2026-11-18T15:00:00'),
    );
    expect(outsideQuietHours(ist('2026-11-18T22:30:00'), quiet, 'Asia/Kolkata')).toEqual(
      ist('2026-11-19T09:00:00'),
    );
    expect(outsideQuietHours(ist('2026-11-19T02:15:00'), quiet, 'Asia/Kolkata')).toEqual(
      ist('2026-11-19T09:00:00'),
    );
    // Same-day quiet window (13 → 14) and no quiet hours at all.
    expect(
      outsideQuietHours(ist('2026-11-18T13:20:00'), { start: 13, end: 14 }, 'Asia/Kolkata'),
    ).toEqual(ist('2026-11-18T14:00:00'));
    expect(
      outsideQuietHours(ist('2026-11-18T23:00:00'), { start: 0, end: 0 }, 'Asia/Kolkata'),
    ).toEqual(ist('2026-11-18T23:00:00'));
  });

  it('plans each follow-up, then the "No reply" check, then nothing when disabled', () => {
    const from = ist('2026-11-18T10:00:00');
    expect(planNextFollowUp(settings, 0, from)).toEqual({
      kind: 'followup',
      step: 0,
      dueAt: ist('2026-11-18T13:00:00'),
    });
    // 24 h after 19:30 is 19:30 next day: outside quiet hours, unchanged.
    expect(planNextFollowUp(settings, 1, ist('2026-11-18T19:30:00'))?.dueAt).toEqual(
      ist('2026-11-19T19:30:00'),
    );
    expect(planNextFollowUp(settings, 2, from)).toEqual({
      kind: 'unresponsive',
      step: 2,
      dueAt: ist('2026-11-20T10:00:00'),
    });
    expect(planNextFollowUp({ ...settings, enabled: false }, 0, from)).toBeNull();
  });

  it('names follow-up templates after their text', () => {
    expect(followUpTemplateName(settings.template)).toMatch(/^qualify_followup_[0-9a-f]{8}$/);
    expect(
      followUpTemplateName({ ...settings.template, bodyText: 'Different text {{1}}' }),
    ).not.toBe(followUpTemplateName(settings.template));
  });

  it('asks for a short nudge instead of an answer when the lead went quiet', () => {
    const note = buildStateNote({
      today: '2026-11-18',
      fields: {},
      definitions: fields,
      status: 'engaged',
      leadName: 'Rahul',
      followUp: { step: 0, hoursSilent: 3.2 },
    });
    expect(note).toContain('has not replied for about 3 hours (follow-up 1)');
    expect(note).not.toContain("reply to the lead's latest message");
  });
});

describe('scoring', () => {
  const scoring = resolveScoring(playbook);
  const answers = {
    destination: 'Dubai',
    travel_month: '2026-12',
    travelers: '2 adults',
    departure_city: 'Delhi',
    budget: '120000 INR total',
    passport_status: 'Ready',
  };

  it('reads amounts, people and months the way the agent stores them', () => {
    expect(parseAmount('60000-70000 INR total')).toBe(60000);
    expect(parseAmount('₹50k–1L')).toBe(50000);
    expect(parseAmount('1.5 lakh per person')).toBe(150000);
    expect(parseAmount('35,000 INR per person')).toBe(35000);
    expect(parseAmount('not sure')).toBeNull();
    expect(countPeople('2 adults, 1 child (5 yrs)')).toBe(3);
    expect(countPeople('couple')).toBe(2);
    expect(countPeople('4')).toBe(4);
    expect(monthsAhead('2026-12', '2026-11-18')).toBe(1);
    expect(monthsAhead('2027-06', '2026-11-18')).toBe(7);
    expect(monthsAhead('flexible', '2026-11-18')).toBeNull();
  });

  it('adds rule points and AI intent, with a breakdown and a reason', () => {
    const result = scoreLead({
      definitions: fields,
      scoring,
      fields: answers,
      signals: { urgency: 8, seriousness: 7, buyingSignals: 9, note: '' },
      status: 'qualified',
      today: '2026-11-18',
    });
    // Month within 1 month 25 + ₹60,000 per person 20 + passport 10 + complete 15 + AI 24.
    expect(result.details.rulePoints).toBe(70);
    expect(result.details.aiPoints).toBe(24);
    expect(result).toMatchObject({ score: 94, grade: 'hot' });
    expect(result.details.breakdown).toContainEqual({
      label: 'Budget: 120000 INR total (≈ ₹60,000 per person)',
      points: 20,
    });
    expect(result.details.reason).toContain('Travel month: 2026-12 (within 1 month) +25');
  });

  it('grades warm, cold and not-a-fit by the thresholds and status', () => {
    const base = { definitions: fields, scoring, today: '2026-11-18', signals: null };
    const warm = scoreLead({ ...base, fields: answers, status: 'qualified' });
    expect(warm).toMatchObject({ score: 70, grade: 'warm' });
    const cold = scoreLead({ ...base, fields: { travel_month: 'flexible' }, status: 'engaged' });
    expect(cold).toMatchObject({ score: 3, grade: 'cold' });
    const notFit = scoreLead({ ...base, fields: answers, status: 'disqualified' });
    expect(notFit.grade).toBe('disqualified');
  });

  it('defaults to completeness for questions without travel rules', () => {
    const generic = defaultScoring([fields[0]!]);
    expect(generic).toMatchObject({ rules: [], completePoints: 70, aiMaxPoints: 30 });
    expect(maxRulePoints(scoring)).toBe(70);
  });
});

describe('travel template', () => {
  it('is a valid playbook config', () => {
    expect(playbookConfigSchema.safeParse(playbook).success).toBe(true);
  });
});

describe('mergeExtractedFields', () => {
  it('keeps a typed answer outside the options only when the question allows it', () => {
    const withOther = mergeExtractedFields(fields, {}, [{ key: 'trip_type', value: 'Pilgrimage' }]);
    expect(withOther.fields.trip_type).toBe('Pilgrimage');
    const strict = mergeExtractedFields(fields, {}, [{ key: 'passport_status', value: 'Lost it' }]);
    expect(strict.fields.passport_status).toBeUndefined();
  });

  it('normalises values by field type and reports what changed', () => {
    const result = mergeExtractedFields(fields, { destination: 'Dubai' }, [
      { key: 'travel_month', value: '2026-12' },
      { key: 'trip_type', value: 'honeymoon' },
      { key: 'trip_duration', value: '5 nights' },
      { key: 'passport_status', value: 'ready' },
      { key: 'destination', value: 'Dubai' },
    ]);
    expect(result.fields).toMatchObject({
      destination: 'Dubai',
      travel_month: '2026-12',
      trip_type: 'Honeymoon',
      trip_duration: '5',
      passport_status: 'Ready',
    });
    expect(result.changed).toEqual([
      'travel_month',
      'trip_type',
      'trip_duration',
      'passport_status',
    ]);
  });

  it('rejects unknown keys, empty values and values that do not fit the type', () => {
    const result = mergeExtractedFields(fields, {}, [
      { key: 'favourite_colour', value: 'blue' },
      { key: 'budget', value: 'unknown' },
      { key: 'travel_month', value: 'December' },
      { key: 'passport_status', value: 'Business' },
    ]);
    expect(result.fields).toEqual({});
    expect(result.rejected.map((item) => item.key)).toEqual([
      'favourite_colour',
      'budget',
      'travel_month',
      'passport_status',
    ]);
  });

  it('lets the lead correct a value', () => {
    const result = mergeExtractedFields(fields, { destination: 'Goa' }, [
      { key: 'destination', value: 'Kerala' },
    ]);
    expect(result.fields.destination).toBe('Kerala');
    expect(result.changed).toEqual(['destination']);
  });
});

describe('qualification progress', () => {
  it('lists missing required fields in priority order', () => {
    const missing = missingRequiredFields(fields, { destination: 'Dubai', travelers: '2 adults' });
    expect(missing.map((field) => field.key)).toEqual(['travel_month', 'departure_city', 'budget']);
  });

  it('is complete when every required field is present', () => {
    const complete = {
      destination: 'Dubai',
      travel_month: '2026-12',
      travelers: '2 adults',
      departure_city: 'Delhi',
      budget: '70000 INR total',
    };
    expect(isQualificationComplete(fields, complete)).toBe(true);
    expect(isQualificationComplete(fields, { destination: 'Dubai' })).toBe(false);
  });
});

describe('policies', () => {
  it('keeps the 24 h service window with a safety margin', () => {
    const now = new Date('2026-11-18T12:00:00Z');
    expect(isServiceWindowOpen(new Date('2026-11-18T00:00:00Z'), now)).toBe(true);
    expect(isServiceWindowOpen(new Date('2026-11-17T12:02:00Z'), now)).toBe(false);
    expect(isServiceWindowOpen(null, now)).toBe(false);
  });

  it('sanitises quick replies to WhatsApp button limits', () => {
    expect(
      sanitizeQuickReplies([
        'Next month',
        ' next MONTH ',
        '',
        'In 2–3 months, please',
        'Not decided',
        'Extra',
      ]),
    ).toEqual(['Next month', 'In 2–3 months', 'Not decided']);
  });

  it('clamps signals to 0–10 integers', () => {
    expect([clampSignal(7.6), clampSignal(-3), clampSignal(42), clampSignal(Number.NaN)]).toEqual([
      8, 0, 10, 0,
    ]);
  });
});

describe('prompt building', () => {
  const system = buildSystemPrompt(playbook, {
    allowedLanguages: ['hinglish', 'en', 'hi'],
    defaultLanguage: 'hinglish',
  });

  it('contains persona, fields, rules and knowledge base, and no per-day data', () => {
    expect(system).toContain('You are Riya, travel advisor at Sunrise Holidays');
    expect(system).toContain('`destination`: Destination (text, REQUIRED, priority 1)');
    expect(system).toContain('Never confirm a final price');
    expect(system).toContain('Dubai 4N/5D');
    expect(system).not.toMatch(/\b2026-\d{2}-\d{2}\b/); // dates belong in the state note (cache)
  });

  it('is deterministic (cacheable)', () => {
    expect(
      buildSystemPrompt(playbook, {
        allowedLanguages: ['hinglish', 'en', 'hi'],
        defaultLanguage: 'hinglish',
      }),
    ).toBe(system);
  });

  it('builds a state note with collected and missing fields', () => {
    const note = buildStateNote({
      today: '2026-11-18',
      fields: { destination: 'Dubai' },
      definitions: fields,
      status: 'engaged',
      leadName: 'Rahul',
    });
    expect(note).toContain('Collected fields: destination=Dubai');
    expect(note).toContain('Missing required fields (ask in this order): travel_month, travelers');
    expect(note).toContain('Qualification complete: no');
  });
});

describe('language detection', () => {
  it('detects Devanagari Hindi, Hinglish and English', () => {
    expect(detectLanguage('नमस्ते, कश्मीर टूर के बारे में जानकारी चाहिए')).toBe('hi');
    expect(detectLanguage('Goa jaana hai dosto ke saath, koi offer hai kya?')).toBe('hinglish');
    expect(detectLanguage('Dec end me, wife ke saath')).toBe('hinglish');
    expect(detectLanguage('Hello, we are looking for a Bali holiday for our family.')).toBe('en');
    expect(detectLanguage('I want a Thailand trip. Can someone call me please?')).toBe('en');
  });

  it('returns null for short or ambiguous messages', () => {
    expect(detectLanguage('kerala')).toBeNull();
    expect(detectLanguage('2 adults')).toBeNull();
    expect(detectLanguage('₹25k-35k')).toBeNull();
  });

  it('chooses the reply language from detection, history and allowed languages', () => {
    const allowed = ['hinglish', 'en', 'hi'] as const;
    expect(
      chooseReplyLanguage({
        latestLeadText: 'chennai',
        previous: 'en',
        allowed,
        fallback: 'hinglish',
      }),
    ).toBe('en');
    expect(
      chooseReplyLanguage({
        latestLeadText: 'chennai',
        previous: null,
        allowed,
        fallback: 'hinglish',
      }),
    ).toBe('hinglish');
    expect(
      chooseReplyLanguage({
        latestLeadText: 'नमस्ते जी कैसे हैं',
        previous: 'en',
        allowed: ['hinglish', 'en'],
        fallback: 'hinglish',
      }),
    ).toBe('hinglish');
  });

  it('puts the reply language in the state note', () => {
    const note = buildStateNote({
      today: '2026-11-18',
      fields: {},
      definitions: fields,
      status: 'engaged',
      leadName: null,
      replyLanguage: 'en',
    });
    expect(note).toContain('Reply language: English.');
  });
});

describe('applyAgentTurn', () => {
  const baseTurn = {
    language: 'en' as const,
    reply: 'You are welcome!',
    quickReplies: ['Ok'],
    askingField: null,
    extracted: [],
    signals: { urgency: 1, seriousness: 1, buyingSignals: 0, note: 'said thanks' },
    handoff: { requested: false, reason: null },
    disqualified: { value: false, reason: null },
  };
  const complete = {
    destination: 'Dubai',
    travel_month: '2026-12',
    travelers: '2 adults',
    departure_city: 'Delhi',
    budget: '70000 INR total',
  };

  it('keeps qualifying-time signals after the lead is qualified', () => {
    const signals = { urgency: 8, seriousness: 9, buyingSignals: 7, note: 'Honeymoon, ready' };
    const applied = applyAgentTurn(
      fields,
      { fields: complete, status: 'qualified', signals },
      baseTurn,
    );
    expect(applied.signals).toEqual(signals);
    expect(applied.becameQualified).toBe(false);
    expect(applied.options).toEqual({ kind: 'none' });
  });

  it('moves a contacted lead (opening sent) to engaged on the first reply', () => {
    const applied = applyAgentTurn(fields, { fields: {}, status: 'contacting' }, baseTurn);
    expect(applied.status).toBe('engaged');
  });

  it('updates signals while still qualifying', () => {
    const applied = applyAgentTurn(
      fields,
      {
        fields: {},
        status: 'engaged',
        signals: { urgency: 8, seriousness: 9, buyingSignals: 7, note: 'x' },
      },
      baseTurn,
    );
    expect(applied.signals).toMatchObject({ urgency: 1, note: 'said thanks' });
  });
});

describe('reply options (questions with options vs plain questions)', () => {
  const base = { definitions: fields, status: 'engaged', language: 'en' as const, suggested: [] };

  it('shows ≤3 short choice options as buttons', () => {
    expect(chooseReplyOptions({ ...base, askingField: 'hotel_category' })).toEqual({
      kind: 'buttons',
      buttons: ['3 star', '4 star', '5 star'],
    });
  });

  it('shows 4–10 choice options as a list menu, labelled in the lead language', () => {
    expect(chooseReplyOptions({ ...base, askingField: 'trip_type', language: 'hinglish' })).toEqual(
      {
        kind: 'list',
        buttonLabel: 'Choose karein',
        rows: ['Honeymoon', 'Family', 'Friends', 'Solo', 'Group'],
      },
    );
  });

  it('shows Yes/No buttons in the lead language for yes/no questions', () => {
    const withYesNo = [
      ...fields,
      { key: 'visa_needed', label: 'Visa', type: 'yes_no' as const, required: false, priority: 20 },
    ];
    expect(
      chooseReplyOptions({
        ...base,
        definitions: withYesNo,
        askingField: 'visa_needed',
        language: 'hi',
      }),
    ).toEqual({ kind: 'buttons', buttons: ['हाँ', 'नहीं'] });
  });

  it('uses model suggestions for plain questions, and nothing once qualified', () => {
    expect(
      chooseReplyOptions({
        ...base,
        askingField: 'travel_month',
        suggested: ['This month', 'Next month'],
      }),
    ).toEqual({ kind: 'buttons', buttons: ['This month', 'Next month'] });
    expect(chooseReplyOptions({ ...base, askingField: 'departure_city' })).toEqual({
      kind: 'none',
    });
    expect(
      chooseReplyOptions({ ...base, status: 'qualified', askingField: 'hotel_category' }),
    ).toEqual({
      kind: 'none',
    });
  });

  it('rejects choice questions without options', () => {
    const invalid = {
      ...playbook,
      fields: [{ key: 'x', label: 'X', type: 'choice', required: true, priority: 1 }],
    };
    expect(playbookConfigSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('opening message', () => {
  const opening = resolveOpening(playbook);

  it('renders template parameters from the lead and business', () => {
    const rendered = renderOpening(opening, {
      leadName: 'Rahul Sharma',
      fields: {},
      businessName: 'Sunrise Holidays',
    });
    expect(rendered.params).toEqual(['Rahul', 'Sunrise Holidays']);
    expect(rendered.text).toContain('Hi Rahul! 👋 Thanks for your enquiry with Sunrise Holidays.');
  });

  it('falls back when the name is unknown and cleans unsafe characters', () => {
    expect(resolveParam('lead.firstName', { leadName: null, fields: {}, businessName: 'X' })).toBe(
      'there',
    );
    expect(
      resolveParam('field:destination|our packages', {
        leadName: null,
        fields: {},
        businessName: 'X',
      }),
    ).toBe('our packages');
    expect(
      resolveParam('field:destination', {
        leadName: null,
        fields: { destination: 'Goa\n\tbeach' },
        businessName: 'X',
      }),
    ).toBe('Goa beach');
  });

  it('names the template after its text, so a changed text needs a new approval', () => {
    const name = openingTemplateName(opening);
    expect(name).toMatch(/^qualify_opening_[0-9a-f]{8}$/);
    expect(openingTemplateName({ ...opening })).toBe(name);
    expect(openingTemplateName({ ...opening, bodyText: opening.bodyText + '!' })).not.toBe(name);
    expect(openingTemplateName({ ...opening, buttons: ['Yes'] })).not.toBe(name);
  });

  it('gives Meta an example for every placeholder', () => {
    expect(
      openingExampleParams(
        { ...opening, bodyParams: ['lead.firstName', 'business.name', 'field:destination'] },
        'Sunrise Holidays',
      ),
    ).toEqual(['Rahul', 'Sunrise Holidays', 'Dubai']);
  });

  it('provides a default opening for playbooks created before M4', () => {
    const { opening: _unused, ...legacy } = playbook;
    expect(resolveOpening(legacy).bodyParams).toEqual(['lead.firstName', 'business.name']);
  });
});

describe('toModelHistory', () => {
  it('maps directions to roles and merges consecutive messages', () => {
    const history = toModelHistory([
      { direction: 'inbound', sender: 'lead', type: 'text', body: 'Hi' },
      { direction: 'inbound', sender: 'lead', type: 'text', body: 'Dubai package?' },
      { direction: 'outbound', sender: 'ai', type: 'text', body: 'Sure! When?' },
      { direction: 'inbound', sender: 'lead', type: 'audio', body: null },
      { direction: 'outbound', sender: 'human_app', type: 'text', body: 'Calling you now' },
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'Hi\nDubai package?' },
      { role: 'assistant', content: 'Sure! When?' },
      {
        role: 'user',
        content: '[The lead sent a audio message. You can only read text, so ask them to type it.]',
      },
      { role: 'assistant', content: '[Sent by a human team member] Calling you now' },
    ]);
  });
});

import { createTemplateRequestSchema } from '@qualify/shared';
import { describe, expect, it } from 'vitest';
import { toMessageTemplate } from './templates.service';

describe('templates', () => {
  it('maps a Graph template and marks where the agent uses it', () => {
    const template = toMessageTemplate(
      {
        id: '1',
        name: 'qualify_opening_abc',
        language: 'en',
        status: 'APPROVED',
        category: 'MARKETING',
        rejected_reason: 'NONE',
        quality_score: { score: 'GREEN' },
        components: [
          { type: 'HEADER', format: 'TEXT', text: 'Hello' },
          { type: 'BODY', text: 'Hi {{1}}, thanks for your enquiry.' },
          { type: 'FOOTER', text: 'Reply STOP to opt out' },
          { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Yes' }] },
        ],
      },
      { opening: ['qualify_opening_abc'], followup: [null] },
    );
    expect(template).toMatchObject({
      headerText: 'Hello',
      bodyText: 'Hi {{1}}, thanks for your enquiry.',
      footerText: 'Reply STOP to opt out',
      buttons: [{ type: 'QUICK_REPLY', text: 'Yes' }],
      rejectedReason: null,
      qualityScore: 'GREEN',
      usedFor: ['opening'],
    });
  });

  it('checks variables and examples before anything goes to Meta', () => {
    const base = { name: 'order_update', language: 'en', category: 'UTILITY' } as const;
    expect(
      createTemplateRequestSchema.safeParse({
        ...base,
        bodyText: 'Hi {{1}}, your visit is on {{2}}.',
        examples: ['Asha', '12 Dec'],
      }).success,
    ).toBe(true);
    const gap = createTemplateRequestSchema.safeParse({
      ...base,
      bodyText: 'Hi {{1}}, see {{3}}',
      examples: ['a', 'b'],
    });
    expect(gap.error?.issues.map((issue) => issue.message)).toContain(
      'Number the variables {{1}}, {{2}}, … without gaps',
    );
    const missing = createTemplateRequestSchema.safeParse({
      ...base,
      bodyText: 'Hi {{1}}',
      examples: [],
    });
    expect(missing.success).toBe(false);
    const badName = createTemplateRequestSchema.safeParse({
      ...base,
      name: 'Order Update',
      bodyText: 'Hi',
    });
    expect(badName.success).toBe(false);
    const headerVariable = createTemplateRequestSchema.safeParse({
      ...base,
      headerText: 'Hi {{1}}',
      bodyText: 'Hello',
    });
    expect(headerVariable.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { problemsOf } from './whatsapp-health.controller';

const healthy = {
  number: {
    phoneNumberId: 'pn',
    displayPhone: '+91 93509 83656',
    verifiedName: 'AppsDemo',
    qualityRating: 'GREEN',
    status: 'CONNECTED',
    nameStatus: 'APPROVED',
    messagingLimit: 'TIER_2K',
    throughput: 'STANDARD',
    platform: 'CLOUD_API',
  },
  account: { name: 'AppsDemo', reviewStatus: 'APPROVED', businessVerification: 'verified' },
  webhooksSubscribed: true,
};

describe('WhatsApp health problems', () => {
  it('reports nothing for a healthy number', () => {
    expect(problemsOf(healthy)).toEqual([]);
  });

  it('lists what to fix, most serious first', () => {
    const problems = problemsOf({
      ...healthy,
      number: {
        ...healthy.number,
        status: 'FLAGGED',
        qualityRating: 'RED',
        nameStatus: 'DECLINED',
      },
      webhooksSubscribed: false,
    });
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain('FLAGGED');
    expect(problems[1]).toContain('Quality rating is low');
    expect(problems[2]).toContain('DECLINED');
    expect(problems[3]).toContain('not subscribed');
  });
});

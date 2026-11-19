import { describe, expect, it } from 'vitest';
import { periodLabel, renderReportEmail, type ReportEmailInput } from './report-email.ts';

const base: ReportEmailInput = {
  productName: 'AppsDemo Qualify',
  workspaceName: 'Sunrise Holidays',
  reportName: 'Daily leads',
  period: { from: '2026-11-17', to: '2026-11-17' },
  scope: null,
  summary: {
    total: 12,
    hot: 3,
    warm: 4,
    cold: 2,
    disqualified: 1,
    unscored: 2,
    qualified: 5,
    handoffs: 2,
  },
  topLeads: [
    {
      name: 'Neha <script>alert(1)</script>',
      phone: '+919812345678',
      grade: 'hot',
      score: 88,
      note: 'Wants a 5-night trip in December & asked for a call',
      origin: 'Winter campaign',
      url: 'https://qualify.example.com/conversations?lead=1',
    },
    {
      name: null,
      phone: '+919800000001',
      grade: null,
      score: null,
      note: null,
      origin: null,
      url: 'javascript:alert(1)',
    },
  ],
  leadsUrl: 'https://qualify.example.com/leads?from=2026-11-17&to=2026-11-17',
  attachment: { rows: 12, capped: false },
};

describe('periodLabel', () => {
  it('names a day, a range within a month, a full month and a range across months', () => {
    expect(periodLabel({ from: '2026-11-17', to: '2026-11-17' })).toBe('Tue, 17 Nov 2026');
    expect(periodLabel({ from: '2026-11-16', to: '2026-11-22' })).toBe('16–22 Nov 2026');
    expect(periodLabel({ from: '2026-11-01', to: '2026-11-30' })).toBe('November 2026');
    expect(periodLabel({ from: '2026-10-28', to: '2026-11-03' })).toBe('28 Oct – 3 Nov 2026');
    expect(periodLabel({ from: '2026-12-29', to: '2027-01-04' })).toBe('29 Dec 2026 – 4 Jan 2027');
  });
});

describe('renderReportEmail', () => {
  it('summarises the period in the subject', () => {
    expect(renderReportEmail(base).subject).toBe(
      'Daily leads: 12 new leads, 3 Hot · Tue, 17 Nov 2026',
    );
    const empty = renderReportEmail({
      ...base,
      summary: { ...base.summary, total: 0, hot: 0 },
      topLeads: [],
      attachment: null,
    });
    expect(empty.subject).toBe('Daily leads: no new leads · Tue, 17 Nov 2026');
    expect(empty.html).toContain('No new leads came in during this period.');
    expect(empty.html).not.toContain('Top leads');
  });

  it('escapes lead text and only links to http(s) URLs', () => {
    const { html, text } = renderReportEmail(base);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Neha &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('December &amp; asked');
    expect(html).not.toContain('javascript:');
    expect(html).toContain(
      'href="https://qualify.example.com/leads?from=2026-11-17&amp;to=2026-11-17"',
    );
    // A lead without a name shows its phone, once.
    expect(html).toContain('>+919800000001</a>');
    expect(html.split('+919800000001')).toHaveLength(2);
    expect(text).toContain('- +919800000001 · Not scored');
    expect(text).toContain('Hot: 3');
    expect(text).toContain('- Neha <script>alert(1)</script> (+919812345678) · Hot 88');
    expect(text).toContain(
      'Open leads: https://qualify.example.com/leads?from=2026-11-17&to=2026-11-17',
    );
  });

  it('mentions the scope and a capped attachment', () => {
    const { html } = renderReportEmail({
      ...base,
      scope: 'Hot and Warm leads · Premium agent',
      attachment: { rows: 10_000, capped: true },
    });
    expect(html).toContain('Tue, 17 Nov 2026 · Hot and Warm leads · Premium agent');
    expect(html).toContain('The attached Excel has the first 10,000 leads.');
  });
});

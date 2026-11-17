import type { LeadGrade } from '@qualify/shared';

// Fictional sample data for the M0 design preview. Real data arrives with the leads API (M4/M5).

export interface SampleLead {
  id: string;
  name: string;
  trip: string;
  source: 'Meta form' | 'Click-to-WhatsApp';
  score: number;
  grade: LeadGrade;
  receivedAgo: string;
}

export const sampleLeads: SampleLead[] = [
  {
    id: 'l1',
    name: 'Rahul Sharma',
    trip: 'Bali honeymoon · 6N',
    source: 'Click-to-WhatsApp',
    score: 86,
    grade: 'hot',
    receivedAgo: '2 min ago',
  },
  {
    id: 'l2',
    name: 'Arjun Mehta',
    trip: 'Dubai with friends · 4N',
    source: 'Meta form',
    score: 81,
    grade: 'hot',
    receivedAgo: '14 min ago',
  },
  {
    id: 'l3',
    name: 'Priya Nair',
    trip: 'Kashmir family trip · 5N',
    source: 'Meta form',
    score: 72,
    grade: 'warm',
    receivedAgo: '9 min ago',
  },
  {
    id: 'l4',
    name: 'Ananya Iyer',
    trip: 'Kerala backwaters · 4N',
    source: 'Click-to-WhatsApp',
    score: 63,
    grade: 'warm',
    receivedAgo: '38 min ago',
  },
  {
    id: 'l5',
    name: 'Sneha Kapoor',
    trip: 'Goa weekend · 2N',
    source: 'Click-to-WhatsApp',
    score: 44,
    grade: 'cold',
    receivedAgo: '22 min ago',
  },
  {
    id: 'l6',
    name: 'Vikram Singh',
    trip: 'Europe group tour · 10N',
    source: 'Meta form',
    score: 18,
    grade: 'disqualified',
    receivedAgo: '31 min ago',
  },
];

export interface KpiSample {
  label: string;
  value: number;
  suffix?: string;
  hint: string;
}

export const sampleKpis = {
  leadsToday: { label: 'Leads today', value: 247, hint: '+18% vs yesterday' },
  qualifiedRate: { label: 'Qualified', value: 38, suffix: '%', hint: '94 of 247 leads' },
  hotLeads: { label: 'Hot leads', value: 41, hint: 'Sent to sales via webhook' },
  firstResponse: {
    label: 'Median first response',
    value: 28,
    suffix: 's',
    hint: 'Target: under 60s',
  },
} satisfies Record<string, KpiSample>;

export const sampleScoreBreakdown = {
  lead: 'Rahul Sharma',
  trip: 'Bali honeymoon · International',
  score: 86,
  grade: 'hot' as LeadGrade,
  items: [
    { label: 'Travel date within 6 weeks', points: 25 },
    { label: 'Budget matches package', points: 20 },
    { label: 'Passport ready', points: 10 },
    { label: 'Travelers: 2 adults', points: 7 },
    { label: 'AI intent: asked for itinerary', points: 24 },
  ],
};

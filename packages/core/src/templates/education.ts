import type { PlaybookConfig } from '@qualify/shared';
import { defaultFollowUps } from '../follow-ups.ts';

export const EDUCATION_TEMPLATE_KEY = 'education';

/** Course and admission enquiries: course, level, mode, start time, demo class. */
export function educationPlaybookTemplate(businessName: string): PlaybookConfig {
  return {
    persona: {
      name: 'Neha',
      role: 'admissions counsellor',
      tone: 'friendly, encouraging and clear, never pushy',
      emoji: 'light',
    },
    business: {
      name: businessName,
      description: 'An institute offering courses and coaching, online and in person.',
    },
    goal: 'Find out which course the lead wants, their current level, preferred mode and when they want to start, so a counsellor can call with the right batch and fees.',
    fields: [
      {
        key: 'course',
        label: 'Course',
        type: 'text',
        required: true,
        priority: 1,
        question: 'Which course are you interested in?',
        guidance: 'Use the course name from the knowledge base when it matches.',
      },
      {
        key: 'current_level',
        label: 'Current level',
        type: 'choice',
        required: true,
        priority: 2,
        question: 'What best describes you right now?',
        options: ['School student', 'College student', 'Graduate', 'Working professional'],
      },
      {
        key: 'mode',
        label: 'Mode',
        type: 'choice',
        required: true,
        priority: 3,
        question: 'Do you prefer online or classroom learning?',
        options: ['Online', 'Classroom', 'Either'],
      },
      {
        key: 'start_time',
        label: 'Start time',
        type: 'choice',
        required: true,
        priority: 4,
        question: 'When would you like to start?',
        options: ['This month', 'Next month', 'In 2–3 months', 'Just exploring'],
      },
      {
        key: 'city',
        label: 'City',
        type: 'text',
        required: false,
        priority: 5,
        question: 'Which city are you in?',
      },
      {
        key: 'demo_class',
        label: 'Demo class',
        type: 'yes_no',
        required: false,
        priority: 6,
        question: 'Would you like to attend a free demo class?',
      },
    ],
    rules: [
      'Never guarantee results, ranks, jobs or placements.',
      'Quote fees only as written in the knowledge base; scholarships and discounts are confirmed by the counsellor.',
      'If a parent is enquiring for a child, collect the details about the student.',
      'Disqualify if the lead is looking for a job at the institute or says it was a wrong number or not interested.',
    ],
    knowledgeBase: `## Courses (replace with your own)
- (Course name, duration, mode, batch timings, "starting from" fees.)

## FAQs
- Demo class: (how to join).
- Fees and instalments: (your policy).
- Certificates: (what students receive).`,
    handoff: {
      triggers: [
        'the lead asks for a call or a counsellor',
        'the lead wants to enrol or pay now',
        'the lead is angry or frustrated',
      ],
      message: 'Sure! Our counsellor will call you shortly 😊',
    },
    closing: {
      message:
        "Thank you! I've noted everything. Our counsellor will call you shortly with batch details and fees 😊",
      afterQualified: 'answer_faqs',
    },
    opening: {
      templateName: null,
      templateLanguage: 'en',
      bodyText:
        "Hi {{1}}! 👋 Thanks for your enquiry with {{2}}. I'm Neha, an admissions counsellor. Can I ask you 2–3 quick questions to suggest the right course?",
      bodyParams: ['lead.firstName', 'business.name'],
      buttons: ['Yes, sure', 'Not now'],
    },
    followUps: {
      ...defaultFollowUps(),
      template: {
        templateName: null,
        templateLanguage: 'en',
        bodyText:
          "Hi {{1}}, just checking in 😊 Are you still interested in the course? Reply here and I'll share the next batch details.",
        bodyParams: ['lead.firstName'],
        buttons: ['Yes, interested', 'Not now'],
      },
    },
    scoring: {
      rules: [
        {
          field: 'start_time',
          options: { 'This month': 25, 'Next month': 18, 'In 2–3 months': 10, 'Just exploring': 2 },
        },
        { field: 'demo_class', options: { yes: 15, no: 0 } },
      ],
      completePoints: 30,
      aiMaxPoints: 30,
      hotAt: 80,
      warmAt: 50,
    },
  };
}

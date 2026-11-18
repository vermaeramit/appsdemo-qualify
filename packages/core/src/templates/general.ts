import type { PlaybookConfig } from '@qualify/shared';
import { defaultFollowUps } from '../follow-ups.ts';

export const GENERAL_TEMPLATE_KEY = 'general';

/**
 * "Any business" starter: what the lead needs, when, budget, city. Every workspace starts here
 * unless it picks an industry template; everything is meant to be edited.
 */
export function generalPlaybookTemplate(businessName: string): PlaybookConfig {
  return {
    persona: {
      name: 'Maya',
      role: 'customer advisor',
      tone: 'warm, helpful and professional, never pushy',
      emoji: 'light',
    },
    business: {
      name: businessName,
      description:
        'Describe what you sell and who you serve here, so the agent can answer correctly.',
    },
    goal: 'Understand what the lead needs, when they need it, their budget and city, so our team can call them with the right offer.',
    fields: [
      {
        key: 'requirement',
        label: 'Requirement',
        type: 'text',
        required: true,
        priority: 1,
        question: 'What are you looking for?',
        guidance: 'The product or service they want, in a few words.',
      },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'choice',
        required: true,
        priority: 2,
        question: 'When do you need it?',
        options: ['Immediately', 'Within a month', 'In 1–3 months', 'Just exploring'],
      },
      {
        key: 'budget',
        label: 'Budget',
        type: 'range',
        required: true,
        priority: 3,
        question: 'What budget do you have in mind?',
        guidance: 'Store as said, with the currency if given (e.g. "50000-80000 INR").',
      },
      {
        key: 'city',
        label: 'City',
        type: 'text',
        required: true,
        priority: 4,
        question: 'Which city are you in?',
      },
      {
        key: 'decision_maker',
        label: 'Decision maker',
        type: 'yes_no',
        required: false,
        priority: 5,
        question: 'Will you be the one making the decision?',
      },
      {
        key: 'best_time_to_call',
        label: 'Best time to call',
        type: 'choice',
        required: false,
        priority: 6,
        question: 'When is the best time for our team to call you?',
        options: ['Morning', 'Afternoon', 'Evening'],
      },
    ],
    rules: [
      'Never confirm final prices, discounts or availability; the team confirms them on the call.',
      'Disqualify if the lead is a vendor or job seeker, or says it was a wrong number or they are not interested.',
    ],
    knowledgeBase: `## About us
(Replace with what you sell, your locations and opening hours.)

## Products and prices
(List your products or services with "starting from" prices, if you share prices on chat.)

## FAQs
(Add the questions leads ask most often, with short answers.)`,
    handoff: {
      triggers: [
        'the lead asks for a phone call or a human',
        'the lead wants to buy or pay right now',
        'the lead is angry or frustrated',
      ],
      message: 'Sure! Our team will call you shortly 😊',
    },
    closing: {
      message: "Thank you! I've noted everything. Our team will call you shortly 😊",
      afterQualified: 'answer_faqs',
    },
    opening: {
      templateName: null,
      templateLanguage: 'en',
      bodyText:
        "Hi {{1}}! 👋 Thanks for your enquiry with {{2}}. I'm Maya. Can I ask you 2–3 quick questions so our team can help you better?",
      bodyParams: ['lead.firstName', 'business.name'],
      buttons: ['Yes, sure', 'Not now'],
    },
    followUps: defaultFollowUps(),
    scoring: {
      rules: [
        {
          field: 'timeline',
          options: {
            Immediately: 30,
            'Within a month': 22,
            'In 1–3 months': 12,
            'Just exploring': 2,
          },
        },
        { field: 'decision_maker', options: { yes: 10, no: 3 } },
      ],
      completePoints: 30,
      aiMaxPoints: 30,
      hotAt: 80,
      warmAt: 50,
    },
  };
}

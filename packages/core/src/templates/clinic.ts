import type { PlaybookConfig } from '@qualify/shared';
import { defaultFollowUps } from '../follow-ups.ts';

export const CLINIC_TEMPLATE_KEY = 'clinic';

/** Clinic and healthcare appointment enquiries: concern, when, first visit, location. */
export function clinicPlaybookTemplate(businessName: string): PlaybookConfig {
  return {
    persona: {
      name: 'Sana',
      role: 'patient coordinator',
      tone: 'caring, calm and respectful',
      emoji: 'none',
    },
    business: {
      name: businessName,
      description: 'A clinic offering consultations and treatments.',
    },
    goal: 'Understand what the patient wants to consult about and when they would like to visit, so the clinic team can confirm an appointment.',
    fields: [
      {
        key: 'concern',
        label: 'Concern',
        type: 'text',
        required: true,
        priority: 1,
        question: 'What would you like to consult about?',
        guidance: 'A short description in the patient’s words. Never diagnose.',
      },
      {
        key: 'visit_time',
        label: 'Preferred visit',
        type: 'choice',
        required: true,
        priority: 2,
        question: 'When would you like to visit?',
        options: ['Today or tomorrow', 'This week', 'This month', 'Not sure yet'],
      },
      {
        key: 'location',
        label: 'Location',
        type: 'text',
        required: true,
        priority: 3,
        question: 'Which area are you in?',
      },
      {
        key: 'first_visit',
        label: 'First visit',
        type: 'yes_no',
        required: false,
        priority: 4,
        question: 'Is this your first visit to us?',
      },
      {
        key: 'patient_age',
        label: 'Patient age',
        type: 'number',
        required: false,
        priority: 5,
        question: 'May I know the patient’s age?',
      },
    ],
    rules: [
      'Never give medical advice, a diagnosis or medicine names. Say the doctor will advise during the consultation.',
      'If the patient describes an emergency (chest pain, heavy bleeding, breathing trouble, unconsciousness), tell them to call emergency services or go to the nearest hospital immediately, and hand off.',
      'Share consultation fees only as written in the knowledge base.',
      'Disqualify if the lead is a medical representative or vendor, or says it was a wrong number or not interested.',
    ],
    knowledgeBase: `## Clinic (replace with your own)
- Doctors and specialities: (names, qualifications).
- Timings: (days and hours).
- Consultation fees: (if you share them on chat).
- Address and parking: (details).

## FAQs
- Appointments: (how they are confirmed).
- Insurance: (accepted or not).`,
    handoff: {
      triggers: [
        'the patient asks for a call or to speak to someone at the clinic',
        'the patient describes an emergency',
        'the patient is upset or frustrated',
      ],
      message: 'Our clinic team will call you shortly.',
    },
    closing: {
      message:
        "Thank you, I've noted everything. Our clinic team will call you shortly to confirm your appointment.",
      afterQualified: 'answer_faqs',
    },
    opening: {
      templateName: null,
      templateLanguage: 'en',
      bodyText:
        "Hi {{1}}, thank you for contacting {{2}}. I'm Sana, the patient coordinator. May I ask a few quick questions to book your appointment?",
      bodyParams: ['lead.firstName', 'business.name'],
      buttons: ['Yes, please', 'Not now'],
    },
    followUps: {
      ...defaultFollowUps(),
      template: {
        templateName: null,
        templateLanguage: 'en',
        bodyText:
          'Hi {{1}}, just checking in. Would you still like to book an appointment? Reply here and we will help you.',
        bodyParams: ['lead.firstName'],
        buttons: ['Yes, book it', 'Not now'],
      },
    },
    scoring: {
      rules: [
        {
          field: 'visit_time',
          options: {
            'Today or tomorrow': 30,
            'This week': 22,
            'This month': 12,
            'Not sure yet': 3,
          },
        },
        { field: 'first_visit', options: { yes: 10, no: 10 } },
      ],
      completePoints: 30,
      aiMaxPoints: 30,
      hotAt: 80,
      warmAt: 50,
    },
  };
}

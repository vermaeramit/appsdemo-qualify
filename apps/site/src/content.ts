/**
 * The website's words (D-101). Generic on purpose (D-061): industries appear only as examples.
 * Claims stay factual: no invented statistics, customers or reviews.
 */

export type ChatEvent =
  | { kind: 'lead'; text: string; note?: string }
  | { kind: 'ai'; text: string; buttons?: string[] }
  | { kind: 'tap'; text: string }
  | { kind: 'score'; grade: 'Hot' | 'Warm' | 'Cold'; score: number; facts: string[] };

export interface DemoChat {
  industry: string;
  business: string;
  initials: string;
  events: ChatEvent[];
}

/** The hero phone plays these in turn. */
export const DEMO_CHATS: DemoChat[] = [
  {
    industry: 'Real estate',
    business: 'Green Valley Homes',
    initials: 'GV',
    events: [
      {
        kind: 'lead',
        text: "Hi, I'm interested in the 2BHK flats",
        note: 'From your ad · 2BHK in Whitefield',
      },
      {
        kind: 'ai',
        text: 'Hi Priya! 👋 Thanks for reaching out to Green Valley Homes. Is it for yourself, or an investment?',
        buttons: ['For myself', 'Investment'],
      },
      { kind: 'tap', text: 'For myself' },
      {
        kind: 'ai',
        text: 'Lovely! When would you like to move in?',
        buttons: ['Within 3 months', '3–6 months', 'Just exploring'],
      },
      { kind: 'tap', text: 'Within 3 months' },
      { kind: 'ai', text: 'And roughly what budget do you have in mind?' },
      { kind: 'lead', text: 'Around 85 lakh' },
      {
        kind: 'ai',
        text: 'Perfect, thank you! Our advisor will call you today to plan a site visit 🏡',
      },
      { kind: 'score', grade: 'Hot', score: 86, facts: ['For myself', 'Within 3 months', '₹85 L'] },
    ],
  },
  {
    industry: 'Travel',
    business: 'Sunrise Holidays',
    initials: 'SH',
    events: [
      {
        kind: 'lead',
        text: 'Hi, please share details of the Bali package',
        note: 'From your form · Bali 5N/6D',
      },
      {
        kind: 'ai',
        text: 'Hi Rahul! 🌴 Happy to help. When are you planning to travel?',
        buttons: ['This month', 'In 2–3 months', 'Not decided'],
      },
      { kind: 'tap', text: 'In 2–3 months' },
      { kind: 'ai', text: 'How many people are travelling?' },
      { kind: 'lead', text: '2 adults' },
      { kind: 'ai', text: 'Do you both have valid passports?', buttons: ['Yes', 'Applying', 'No'] },
      { kind: 'tap', text: 'Yes' },
      {
        kind: 'ai',
        text: 'Great! Our travel expert will share the best Bali options with you shortly ✈️',
      },
      {
        kind: 'score',
        grade: 'Hot',
        score: 82,
        facts: ['In 2–3 months', '2 adults', 'Passports ready'],
      },
    ],
  },
  {
    industry: 'Education',
    business: 'Bright Path Institute',
    initials: 'BP',
    events: [
      { kind: 'lead', text: 'MBA course ki fees kitni hai?', note: 'From your website' },
      {
        kind: 'ai',
        text: 'Hi Ananya! 🎓 Fees depend on the batch. Aap kaunsa intake dekh rahi hain?',
        buttons: ['January', 'July', 'Not sure'],
      },
      { kind: 'tap', text: 'July' },
      {
        kind: 'ai',
        text: 'Aapki graduation complete ho gayi hai?',
        buttons: ['Yes', 'Final year'],
      },
      { kind: 'tap', text: 'Final year' },
      {
        kind: 'ai',
        text: 'Thank you! Our counsellor will call you with the fee details and scholarships 📚',
      },
      {
        kind: 'score',
        grade: 'Warm',
        score: 64,
        facts: ['July intake', 'Final year', 'Asked about fees'],
      },
    ],
  },
];

export interface Step {
  id: string;
  title: string;
  body: string;
  points: string[];
}

export const STEPS: Step[] = [
  {
    id: 'arrive',
    title: 'A lead comes in',
    body: 'From a Meta lead form, a Click-to-WhatsApp ad, your website or any app through the API. The moment it lands, the clock starts.',
    points: ['Meta lead forms', 'Click-to-WhatsApp ads', 'Website & API'],
  },
  {
    id: 'hello',
    title: 'Your AI agent says hi, in seconds',
    body: 'On your own WhatsApp number, with your business name. A new lead gets your approved opening message; a lead who wrote to you gets a reply straight away.',
    points: ['Your number, your name', 'Replies 24×7', 'Opening template when needed'],
  },
  {
    id: 'ask',
    title: 'It asks your questions, like your best salesperson',
    body: 'One question at a time, with tap-to-answer buttons, in the language the lead writes in. It answers questions about your offers from your own notes, and confirms details the lead already gave in the form.',
    points: [
      'Your questions, your order',
      'English, Hindi, Hinglish…',
      'Answers from your knowledge base',
    ],
  },
  {
    id: 'score',
    title: 'Every lead gets a score',
    body: 'Your rules (timeline, budget, location…) plus the intent the AI reads in the chat. Hot, Warm or Cold, with the reason and a two-line summary.',
    points: ['Rules you control', 'AI-read intent', 'Reason + summary'],
  },
  {
    id: 'deliver',
    title: 'Your team gets the ones worth calling',
    body: 'Hot leads reach your team at once, with the whole conversation. Results go to Excel, your CRM through webhooks, or a scheduled e-mail report. Step in any time: the AI steps back.',
    points: ['Live inbox', 'Webhooks & Excel', 'E-mail reports'],
  },
];

export interface Feature {
  icon: string;
  title: string;
  body: string;
}

export const FEATURES: Feature[] = [
  {
    icon: 'phone',
    title: 'Your own WhatsApp number',
    body: 'Leads talk to your business, not to a bot number. Use a dedicated number, or keep your WhatsApp Business app on the same number where Meta supports it.',
  },
  {
    icon: 'zap',
    title: 'First reply in seconds',
    body: 'Every lead hears from you while they still remember your ad: day, night or Sunday.',
  },
  {
    icon: 'list',
    title: 'Tap-to-answer questions',
    body: 'Buttons and lists make answering effortless, so more leads finish the conversation.',
  },
  {
    icon: 'languages',
    title: 'Speaks their language',
    body: 'Replies in the language the lead writes in: English, Hindi, Hinglish and more.',
  },
  {
    icon: 'gauge',
    title: 'Scores you can trust',
    body: 'Your own rules plus AI-read intent, with the reason behind every grade. Change a rule and every lead is rescored.',
  },
  {
    icon: 'split',
    title: 'One agent per offer',
    body: 'Different questions for different forms, ads or campaigns. Each lead lands with the right agent.',
  },
  {
    icon: 'bell',
    title: 'Polite follow-ups',
    body: 'A friendly nudge when a lead goes quiet, inside WhatsApp’s free window, so reminders cost nothing.',
  },
  {
    icon: 'hand',
    title: 'Human takeover, anytime',
    body: 'Pause the AI with one click. Reply from your WhatsApp app and the AI steps back by itself.',
  },
  {
    icon: 'image',
    title: 'Photos, voice notes, documents',
    body: 'See the photo, play the voice note and open the PDF a lead sent, right in the conversation.',
  },
  {
    icon: 'target',
    title: 'Know which ad brings buyers',
    body: 'Every lead keeps its source: the ad, the form or the campaign. See which ones bring Hot leads.',
  },
  {
    icon: 'receipt',
    title: 'Costs in plain sight',
    body: 'Meta’s own billed amounts and the AI usage, per day, in your dashboard. No surprises.',
  },
  {
    icon: 'shield',
    title: 'Built for business data',
    body: 'Each workspace is isolated at the database level, access tokens are encrypted, and every step is logged.',
  },
];

export interface Industry {
  id: string;
  name: string;
  icon: string;
  questions: string[];
  outcome: { name: string; grade: 'Hot' | 'Warm' | 'Cold'; score: number; summary: string };
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'real-estate',
    name: 'Real estate',
    icon: 'building',
    questions: [
      'Buying for yourself or as an investment?',
      'Which location and configuration?',
      'When do you plan to buy?',
      'What budget range?',
      'Need a home loan?',
    ],
    outcome: {
      name: 'Priya S.',
      grade: 'Hot',
      score: 86,
      summary: '2BHK, Whitefield, within 3 months, ₹85 L. Wants a site visit this weekend.',
    },
  },
  {
    id: 'travel',
    name: 'Travel',
    icon: 'plane',
    questions: [
      'Which destination?',
      'When do you plan to travel?',
      'How many travellers?',
      'Budget per person?',
      'Valid passports?',
    ],
    outcome: {
      name: 'Rahul M.',
      grade: 'Hot',
      score: 82,
      summary: 'Bali for 2 adults in 2–3 months, passports ready, ₹50k per person.',
    },
  },
  {
    id: 'education',
    name: 'Education',
    icon: 'graduation',
    questions: [
      'Which course?',
      'Which intake?',
      'Highest qualification?',
      'City?',
      'Need a scholarship or loan?',
    ],
    outcome: {
      name: 'Ananya K.',
      grade: 'Warm',
      score: 64,
      summary: 'MBA, July intake, final-year student. Asked about fees and scholarships.',
    },
  },
  {
    id: 'clinics',
    name: 'Clinics',
    icon: 'stethoscope',
    questions: [
      'Which treatment are you looking for?',
      'Since when?',
      'Preferred branch?',
      'Preferred day and time?',
      'First visit or follow-up?',
    ],
    outcome: {
      name: 'Vikram R.',
      grade: 'Hot',
      score: 79,
      summary: 'Dental implant consultation, Andheri branch, wants Saturday morning.',
    },
  },
  {
    id: 'any',
    name: 'Any business',
    icon: 'briefcase',
    questions: [
      'What are you looking for?',
      'When do you need it?',
      'Budget?',
      'Are you the decision maker?',
      'Best time to call?',
    ],
    outcome: {
      name: 'Meera J.',
      grade: 'Warm',
      score: 58,
      summary: 'Needs it next month, budget agreed, will decide with a partner.',
    },
  },
];

export const OUTPUTS = [
  {
    icon: 'sheet',
    title: 'Excel export',
    body: 'Any filter, any period, one click. Scores, answers and the source of every lead.',
  },
  {
    icon: 'webhook',
    title: 'Webhooks to your CRM',
    body: 'Signed events with retries the moment a lead is created, qualified or handed off.',
  },
  {
    icon: 'mail',
    title: 'Scheduled e-mail reports',
    body: 'Daily or weekly, with the Excel attached and your hottest leads on top.',
  },
  {
    icon: 'code',
    title: 'REST API',
    body: 'Send leads in from any app, choose the agent, and report the sale back for better scoring.',
  },
];

export const SETUP = [
  {
    title: 'Connect WhatsApp',
    body: 'We connect your WhatsApp Business number with you, on Meta’s official platform.',
  },
  {
    title: 'Pick a template',
    body: 'Start from a ready agent for your industry, then edit the questions, tone and scoring.',
  },
  {
    title: 'Plug in your leads',
    body: 'Link your Meta lead forms and ads, or send leads from your website through the API.',
  },
  {
    title: 'Go live',
    body: 'Test the agent in the dashboard first. Then every new lead gets a reply in seconds.',
  },
];

export const FAQ = [
  {
    question: 'Do I need a new WhatsApp number?',
    answer:
      'Not necessarily. You can use a dedicated number, or, where Meta supports it, keep using the WhatsApp Business app on your existing number while the AI handles new leads. We set it up with you.',
  },
  {
    question: 'What does WhatsApp messaging cost?',
    answer:
      'Meta charges for template messages, such as the first message to a lead who filled a form. Replies inside WhatsApp’s 24-hour customer service window are free, and follow-ups stay inside that window by default. Your dashboard shows the amounts Meta actually billed.',
  },
  {
    question: 'Which languages does the AI speak?',
    answer:
      'It replies in the language the lead writes in, including English, Hindi and Hinglish, and keeps your tone and wording.',
  },
  {
    question: 'Will it replace my sales team?',
    answer:
      'No. It does the first conversation for every lead, so your team spends its time on the Hot ones. It is a qualification engine, not a CRM: results go to the tools you already use.',
  },
  {
    question: 'Can my team take over a chat?',
    answer:
      'Yes. Pause the AI for any lead with one click, or simply reply from your WhatsApp app: the AI notices and steps back.',
  },
  {
    question: 'Is our data safe?',
    answer:
      'Each workspace is isolated at the database level, WhatsApp access tokens are encrypted at rest, and every step is recorded in an activity log. Servers run in India.',
  },
  {
    question: 'Does it work with my CRM?',
    answer:
      'Yes, through signed webhooks, Excel exports, scheduled e-mail reports or the REST API, so any CRM that accepts a webhook or an import can receive your leads.',
  },
  {
    question: 'How long does it take to go live?',
    answer:
      'Usually a day once your WhatsApp number is connected: pick a ready template for your industry, adjust the questions, link your lead sources and test.',
  },
];

import { findTemplate, type PlaybookTemplate, scoreLead } from '@qualify/core';
import type { ChatEvent, DemoChat } from './content';
import type { IndustrySlug } from './pages';

/**
 * The industry pages (D-104). The words are written here; the questions, scoring and rules come
 * from the ready-made agent templates in @qualify/core, and the example score is calculated with
 * the product's own scoring engine, so a page never promises more than the agent does.
 */

type PlaybookConfig = ReturnType<PlaybookTemplate['build']>;
type Grade = 'Hot' | 'Warm' | 'Cold';

interface IndustryCopy {
  slug: IndustrySlug;
  /** The ready-made agent in packages/core/src/templates. */
  templateKey: string;
  name: string;
  /** How the page names its agent: "the ready-made clinic agent". */
  agentNoun: string;
  icon: string;
  /** Search result title (the product name is added after it) and meta description. */
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  headlineAccent: string;
  intro: string;
  /** The ready message the page's WhatsApp buttons open with. */
  demoMessage: string;
  business: { name: string; initials: string };
  /** The hero phone's chat; the score card at the end is calculated from `example`. */
  chat: ChatEvent[];
  example: {
    name: string;
    /** The answers as the agent stores them (what the scoring engine reads). */
    answers: Record<string, string>;
    /** How an answer reads on the page, when the stored form is not friendly. */
    display: Record<string, string>;
    /** AI-read intent, 0–10 each. */
    signals: { urgency: number; seriousness: number; buyingSignals: number };
    summary: string;
    facts: string[];
  };
  painsTitle: string;
  pains: { title: string; body: string }[];
  faq: { question: string; answer: string }[];
}

/** "Today" for the examples, so month answers score the same on every build. */
const EXAMPLE_TODAY = '2026-01-12';

const COPY: readonly IndustryCopy[] = [
  {
    slug: 'real-estate',
    templateKey: 'real-estate',
    name: 'Real estate',
    agentNoun: 'real estate',
    icon: 'building',
    title: 'Real Estate Lead Qualification on WhatsApp',
    description:
      'An AI agent on your WhatsApp number answers every property enquiry in seconds, asks purpose, budget and timeline, and scores each lead Hot, Warm or Cold.',
    eyebrow: 'AI lead qualification for real estate',
    headline: 'Every property enquiry qualified on WhatsApp,',
    headlineAccent: 'before your advisor calls.',
    intro:
      'Leads from your property ads get a reply on your own WhatsApp number in seconds. The AI agent asks whether they want to buy, rent or invest, the property type, location, budget and timeline, offers a site visit, and scores each lead so your advisors call serious buyers first.',
    demoMessage:
      "Hi! I saw your real estate page and I'd like to see how it qualifies property leads.",
    business: { name: 'Green Valley Homes', initials: 'GV' },
    chat: [
      {
        kind: 'lead',
        text: 'Hi, I saw your ad for 2BHK flats in Whitefield',
        note: 'From your ad · 2BHK in Whitefield',
      },
      {
        kind: 'ai',
        text: "Hi Priya! 👋 I'm Kabir from Green Valley Homes. Are you looking to buy, rent or invest?",
        buttons: ['Buy', 'Rent', 'Invest'],
      },
      { kind: 'tap', text: 'Buy' },
      { kind: 'ai', text: 'Great! What budget do you have in mind?' },
      { kind: 'lead', text: 'Around 85 lakh' },
      { kind: 'ai', text: 'How soon are you planning to move or buy?' },
      { kind: 'lead', text: 'Within 3 months' },
      {
        kind: 'ai',
        text: 'Would you like to schedule a site visit?',
        buttons: ['Yes', 'No'],
      },
      { kind: 'tap', text: 'Yes' },
      {
        kind: 'ai',
        text: "Thank you! I've noted everything. Our property advisor will call you shortly with matching options 😊",
      },
    ],
    example: {
      name: 'Priya S.',
      answers: {
        purpose: 'Buy',
        property_type: 'Apartment',
        location: 'Whitefield',
        budget: '8500000 INR',
        timeline: 'Within 3 months',
        bedrooms: '2 BHK',
        site_visit: 'yes',
      },
      display: { site_visit: 'Yes' },
      signals: { urgency: 8, seriousness: 8, buyingSignals: 7 },
      summary:
        '2BHK apartment in Whitefield, buying within 3 months, budget ₹85 lakh. Wants a site visit.',
      facts: ['Buy', 'Within 3 months', '₹85 L'],
    },
    painsTitle: 'Where property leads slip away',
    pains: [
      {
        title: 'Enquiries go cold fast',
        body: 'Buyers often enquire about several projects at once. A reply in seconds, at any hour, keeps your project in the conversation.',
      },
      {
        title: 'Advisors call people who were only browsing',
        body: 'Early research, renters and brokers all arrive through the same ad. Asking first means advisors spend their day on buyers.',
      },
      {
        title: 'Details live in call notes',
        body: 'Budget, area, timeline and site-visit interest arrive as columns with the full chat, so every call starts informed.',
      },
    ],
    faq: [
      {
        question: 'Will the agent quote prices or confirm availability?',
        answer:
          'No. The ready-made agent never confirms availability, final prices, discounts or possession dates; your advisor does. It can share the “starting from” details you add to its knowledge base.',
      },
      {
        question: 'Can it set up site visits?',
        answer:
          'It asks whether the lead wants a site visit and records the answer, which also counts towards the score. Your team confirms the date and time. A lead who wants to book a unit or pay a token amount is handed to your advisor straight away.',
      },
      {
        question: 'What about brokers and wrong numbers?',
        answer:
          'Brokers looking for a partnership, wrong numbers and people who say they are not interested are marked as disqualified, so they do not reach your advisors as leads.',
      },
      {
        question: 'Does it work with my property ads?',
        answer:
          'Yes. Leads from Meta lead forms and Click-to-WhatsApp ads come in automatically, with the ad they came from. Leads from your website or other tools can be sent in through the API.',
      },
    ],
  },
  {
    slug: 'education',
    templateKey: 'education',
    name: 'Education',
    agentNoun: 'education',
    icon: 'graduation',
    title: 'Education Lead Qualification on WhatsApp',
    description:
      'An AI agent on your WhatsApp number answers every course enquiry in seconds, asks course, level, mode and start date, and scores each lead for counsellors.',
    eyebrow: 'AI lead qualification for education and coaching',
    headline: 'Every course enquiry qualified on WhatsApp,',
    headlineAccent: 'before your counsellor calls.',
    intro:
      'Students and parents who enquire from your ads or website get a reply on your own WhatsApp number in seconds. The AI agent asks which course, their current level, online or classroom, and when they want to start, offers a demo class, and scores each enquiry so counsellors call those ready to enrol.',
    demoMessage:
      "Hi! I saw your education page and I'd like to see how it qualifies student enquiries.",
    business: { name: 'Bright Path Institute', initials: 'BP' },
    chat: [
      {
        kind: 'lead',
        text: 'Hi, MBA admission ke baare mein jaanna hai',
        note: 'From your ad · MBA admissions',
      },
      {
        kind: 'ai',
        text: 'Hi Ananya! 🎓 Main Neha, Bright Path Institute se. Aap online padhna chahengi ya classroom mein?',
        buttons: ['Online', 'Classroom', 'Either'],
      },
      { kind: 'tap', text: 'Classroom' },
      { kind: 'ai', text: 'Aur abhi aap kya kar rahi hain: college, graduation ya job?' },
      { kind: 'lead', text: 'College, final year' },
      { kind: 'ai', text: 'Kab se start karna chahengi?' },
      { kind: 'lead', text: 'Isi mahine' },
      {
        kind: 'ai',
        text: 'Kya aap ek free demo class attend karna chahengi?',
        buttons: ['Yes', 'No'],
      },
      { kind: 'tap', text: 'Yes' },
      {
        kind: 'ai',
        text: 'Thank you! Maine sab note kar liya hai. Hamari counsellor aapko batch details aur fees ke saath jaldi call karengi 😊',
      },
    ],
    example: {
      name: 'Ananya K.',
      answers: {
        course: 'MBA',
        current_level: 'College student',
        mode: 'Classroom',
        start_time: 'This month',
        demo_class: 'yes',
      },
      display: { demo_class: 'Yes' },
      signals: { urgency: 5, seriousness: 5, buyingSignals: 4 },
      summary:
        'MBA, final-year college student, classroom, wants to start this month. Booked a free demo class.',
      facts: ['MBA', 'This month', 'Demo class'],
    },
    painsTitle: 'Where student enquiries slip away',
    pains: [
      {
        title: 'Enquiries peak when counsellors are busiest',
        body: 'Around intakes and exams, enquiries arrive faster than anyone can call. Every student hears from you in seconds, even late at night.',
      },
      {
        title: 'The same questions in every chat',
        body: 'Course details, batches and fees come up again and again. The agent answers from your notes while it asks your questions.',
      },
      {
        title: 'No way to tell who is ready to enrol',
        body: 'Start date, current level, mode and demo-class interest show who to call today and who is still exploring.',
      },
    ],
    faq: [
      {
        question: 'Can it answer questions about fees and batches?',
        answer:
          'Yes, from your knowledge base. It quotes fees only as written there; scholarships and discounts are confirmed by your counsellor.',
      },
      {
        question: 'What if a parent enquires for their child?',
        answer:
          'The agent collects the details about the student, so your counsellor knows who the course is for.',
      },
      {
        question: 'Does it promise results or placements?',
        answer: 'No. The ready-made agent never guarantees results, ranks, jobs or placements.',
      },
      {
        question: 'Can it reply in Hindi?',
        answer:
          'Yes. It replies in the language the lead writes in, including Hindi and Hinglish, as in the example on this page.',
      },
    ],
  },
  {
    slug: 'travel',
    templateKey: 'travel-packages',
    name: 'Travel',
    agentNoun: 'travel',
    icon: 'plane',
    title: 'Travel Lead Qualification on WhatsApp',
    description:
      'An AI agent on your WhatsApp number answers every holiday enquiry in seconds, asks destination, dates, travellers and budget, and scores each lead.',
    eyebrow: 'AI lead qualification for travel companies',
    headline: 'Every holiday enquiry qualified on WhatsApp,',
    headlineAccent: 'before your travel expert calls.',
    intro:
      'Holiday enquiries from your ads and forms get a reply on your own WhatsApp number in seconds. The AI agent asks the destination, travel month, travellers, departure city and budget, checks passports for international trips, and scores each lead so your experts quote the serious ones first.',
    demoMessage:
      "Hi! I saw your travel page and I'd like to see how it qualifies holiday enquiries.",
    business: { name: 'Sunrise Holidays', initials: 'SH' },
    chat: [
      {
        kind: 'lead',
        text: 'Hi, please share details of the Bali package for 2 adults',
        note: 'From your ad · Bali 5N/6D',
      },
      {
        kind: 'ai',
        text: "Hi Rahul! 🌴 I'm Riya from Sunrise Holidays. When are you planning to travel?",
      },
      { kind: 'lead', text: 'March' },
      { kind: 'ai', text: 'Lovely! Which city will you start the trip from?' },
      { kind: 'lead', text: 'Delhi' },
      { kind: 'ai', text: 'And what budget range do you have in mind for the trip?' },
      { kind: 'lead', text: 'Around 1 lakh for both of us' },
      {
        kind: 'ai',
        text: 'Is your passport ready?',
        buttons: ['Ready', 'Applied', 'Not yet'],
      },
      { kind: 'tap', text: 'Ready' },
      {
        kind: 'ai',
        text: "Thank you! I've noted everything. Our travel expert will call you shortly with the best options and the final quote 😊",
      },
    ],
    example: {
      name: 'Rahul M.',
      answers: {
        destination: 'Bali',
        travel_month: '2026-03',
        travelers: '2 adults',
        departure_city: 'Delhi',
        budget: '100000 INR total',
        passport_status: 'Ready',
      },
      display: { travel_month: 'March', budget: '₹1 lakh for 2 (₹50,000 each)' },
      signals: { urgency: 7, seriousness: 7, buyingSignals: 5 },
      summary: 'Bali for 2 adults in March, from Delhi, about ₹50,000 per person. Passports ready.',
      facts: ['March', '2 adults', 'Passport ready'],
    },
    painsTitle: 'Where holiday enquiries slip away',
    pains: [
      {
        title: 'Travellers ask several agencies',
        body: 'The agency that replies first gets to send the first quote. Your agent replies in seconds, day or night.',
      },
      {
        title: 'Quotes need details nobody collected',
        body: 'Destination, month, travellers, departure city and budget are collected in the chat, so your expert can quote on the first call.',
      },
      {
        title: 'Dreamers and bookers look the same',
        body: 'Travel month, budget per person and passport status separate people ready to book from people still browsing.',
      },
    ],
    faq: [
      {
        question: 'Will it quote package prices?',
        answer:
          'Only the “starting from” prices you add to its knowledge base. It never confirms a final price, discount, availability or flight fare; your travel expert does.',
      },
      {
        question: 'How does it handle international trips?',
        answer:
          'For international destinations it also asks about passports, after the main questions. Passport status counts towards the score.',
      },
      {
        question: 'How is the budget compared for groups?',
        answer:
          'Budget bands are per person. When a lead gives a total for the group, the score divides it by the number of travellers.',
      },
      {
        question: 'Can it send brochures or itineraries?',
        answer:
          'When a lead asks for a brochure or itinerary, the agent says your travel expert will share it on a call or on WhatsApp, and it never borrows details from a different package.',
      },
    ],
  },
  {
    slug: 'clinics',
    templateKey: 'clinic',
    name: 'Clinics',
    agentNoun: 'clinic',
    icon: 'stethoscope',
    title: 'Clinic Lead Qualification on WhatsApp',
    description:
      'An AI agent on your WhatsApp number answers every patient enquiry in seconds, asks the concern, visit time and area, and never gives medical advice.',
    eyebrow: 'AI lead qualification for clinics',
    headline: 'Every patient enquiry answered on WhatsApp,',
    headlineAccent: 'ready for your front desk.',
    intro:
      'Patients who enquire from your ads or website get a reply on your own WhatsApp number in seconds. The AI agent asks what they want to consult about, when they would like to visit and which area they are in, then your team confirms the appointment. It never gives medical advice.',
    demoMessage:
      "Hi! I saw your clinics page and I'd like to see how it handles patient enquiries.",
    business: { name: 'Smile Care Dental', initials: 'SC' },
    chat: [
      {
        kind: 'lead',
        text: 'Hi, I want to know about dental implants',
        note: 'From your ad · Dental implants',
      },
      {
        kind: 'ai',
        text: "Hi Vikram, thank you for contacting Smile Care Dental. I'm Sana, the patient coordinator. When would you like to visit?",
      },
      { kind: 'lead', text: 'This week, if possible. Is it painful?' },
      {
        kind: 'ai',
        text: 'The doctor will explain the procedure and answer that during your consultation. Which area are you in?',
      },
      { kind: 'lead', text: 'Andheri West' },
      {
        kind: 'ai',
        text: 'Is this your first visit to us?',
        buttons: ['Yes', 'No'],
      },
      { kind: 'tap', text: 'Yes' },
      {
        kind: 'ai',
        text: "Thank you, I've noted everything. Our clinic team will call you shortly to confirm your appointment.",
      },
    ],
    example: {
      name: 'Vikram R.',
      answers: {
        concern: 'Dental implants',
        visit_time: 'This week',
        location: 'Andheri West',
        first_visit: 'yes',
      },
      display: { first_visit: 'Yes' },
      signals: { urgency: 7, seriousness: 6, buyingSignals: 6 },
      summary: 'Dental implant consultation, Andheri West, wants to visit this week. First visit.',
      facts: ['Dental implants', 'This week', 'First visit'],
    },
    painsTitle: 'Where patient enquiries slip away',
    pains: [
      {
        title: 'Patients message after hours',
        body: 'Enquiries keep coming when the front desk is closed. Every patient gets a reply in seconds, with your clinic’s name.',
      },
      {
        title: 'The front desk is juggling calls and walk-ins',
        body: 'The agent collects the concern, preferred visit time and area, so your team only has to confirm the slot.',
      },
      {
        title: 'Health questions need care',
        body: 'The agent never gives medical advice, a diagnosis or medicine names, and points emergencies to emergency services at once.',
      },
    ],
    faq: [
      {
        question: 'Does the agent give medical advice?',
        answer:
          'No. It never gives medical advice, a diagnosis or medicine names, and says the doctor will advise during the consultation.',
      },
      {
        question: 'What happens in an emergency?',
        answer:
          'If a patient describes an emergency, such as chest pain, heavy bleeding or breathing trouble, the agent tells them to call emergency services or go to the nearest hospital immediately, and hands the chat to your team.',
      },
      {
        question: 'Can it book appointments?',
        answer:
          'It collects the concern, preferred visit time and area, then your team calls to confirm the appointment. Patients who ask to speak to someone are handed over at once.',
      },
      {
        question: 'Can it share consultation fees?',
        answer: 'Only as written in your knowledge base, so patients always get the fee you set.',
      },
    ],
  },
];

export interface IndustryQuestion {
  key: string;
  question: string;
  options: string[];
  required: boolean;
}

export interface ScoringRow {
  label: string;
  values: { label: string; points: number }[];
}

export interface IndustryPage extends IndustryCopy {
  /** The ready-made agent's short description (e.g. for links to this page). */
  templateSummary: string;
  questions: IndustryQuestion[];
  scoringRows: ScoringRow[];
  scoring: NonNullable<PlaybookConfig['scoring']>;
  guardrails: string[];
  handoff: string[];
  result: { score: number; grade: Grade; rows: { label: string; points: number }[] };
  demo: DemoChat;
}

const MONTH_LABELS = ['Within 1 month', 'Within 3 months', 'Within 6 months', 'Later or flexible'];
const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function scoringRows(config: PlaybookConfig): ScoringRow[] {
  const scoring = config.scoring!;
  return scoring.rules.map((rule) => {
    const field = config.fields.find((item) => item.key === rule.field);
    const label = field?.label ?? rule.field;
    if (rule.options) {
      return {
        label,
        values: Object.entries(rule.options).map(([option, points]) => ({
          label: option === 'yes' ? 'Yes' : option === 'no' ? 'No' : option,
          points,
        })),
      };
    }
    if (rule.months) {
      return {
        label,
        values: rule.months.map((points, band) => ({ label: MONTH_LABELS[band]!, points })),
      };
    }
    if (rule.amounts) {
      const each = rule.perPersonField ? ' per person' : '';
      const bands = [...rule.amounts].sort((a, b) => b.min - a.min);
      return {
        label,
        values: bands.map((band, index) => ({
          label:
            band.min > 0
              ? `₹${rupees.format(band.min)} or more${each}`
              : `Below ₹${rupees.format(bands[index - 1]?.min ?? 0)}${each}`,
          points: band.points,
        })),
      };
    }
    return { label, values: [{ label: 'Answered', points: rule.points ?? 0 }] };
  });
}

function buildPage(copy: IndustryCopy): IndustryPage {
  const template = findTemplate(copy.templateKey);
  if (template.key !== copy.templateKey) {
    throw new Error(`No ready-made agent "${copy.templateKey}" for the ${copy.slug} page`);
  }
  const config = template.build(copy.business.name);
  const scoring = config.scoring!;

  const scored = scoreLead({
    definitions: config.fields,
    scoring,
    fields: copy.example.answers,
    signals: { ...copy.example.signals, note: '' },
    status: 'qualified',
    today: EXAMPLE_TODAY,
  });
  if (scored.grade === 'disqualified') throw new Error(`The ${copy.slug} example is disqualified`);
  const grade = (scored.grade.charAt(0).toUpperCase() + scored.grade.slice(1)) as Grade;
  // The engine lists one entry per scoring rule (in order), then complete answers, then AI intent.
  const rows = scored.details.breakdown.map((item, index) => {
    const rule = scoring.rules[index];
    if (rule) {
      const field = config.fields.find((entry) => entry.key === rule.field);
      const value = copy.example.display[rule.field] ?? copy.example.answers[rule.field];
      return { label: `${field?.label ?? rule.field}: ${value}`, points: item.points };
    }
    return {
      label: item.label.startsWith('AI intent') ? 'Intent the AI read in the chat' : item.label,
      points: item.points,
    };
  });

  return {
    ...copy,
    templateSummary: template.description,
    questions: config.fields.map((field) => ({
      key: field.key,
      question: field.question ?? field.label,
      options: field.options ?? (field.type === 'yes_no' ? ['Yes', 'No'] : []),
      required: field.required,
    })),
    scoringRows: scoringRows(config),
    scoring,
    guardrails: config.rules.slice(0, 3),
    handoff: config.handoff.triggers.map(sentence),
    result: { score: scored.score, grade, rows },
    demo: {
      industry: copy.name,
      business: copy.business.name,
      initials: copy.business.initials,
      events: [
        ...copy.chat,
        { kind: 'score', grade, score: scored.score, facts: copy.example.facts },
      ],
    },
  };
}

export const INDUSTRY_PAGES: readonly IndustryPage[] = COPY.map(buildPage);

export function industryPage(slug: IndustrySlug): IndustryPage {
  const page = INDUSTRY_PAGES.find((item) => item.slug === slug);
  if (!page) throw new Error(`No industry page "${slug}"`);
  return page;
}

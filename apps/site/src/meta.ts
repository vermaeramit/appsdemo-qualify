import { site } from './config';

/** How the website describes itself to search engines, link previews and AI assistants. */
export const TITLE = `${site.productName} — AI lead qualification on WhatsApp`;

/** Search results show about 155 characters, so the meta description stays under that. */
export const DESCRIPTION =
  'An AI agent on your own WhatsApp number replies to every Meta ad and form lead in seconds, asks your questions and scores each lead Hot, Warm or Cold.';

/** The full sentence, where there is room (structured data, llms.txt). */
export const LONG_DESCRIPTION =
  'An AI agent on your own WhatsApp number talks to every new lead from Meta ads, lead forms and your website in seconds, asks your questions, scores each lead Hot, Warm or Cold, and sends your team only the ones worth calling.';

/** Page sections other pages and llms.txt link to (the ids in the sections). */
export const SECTION_IDS = {
  howItWorks: 'how-it-works',
  features: 'features',
  industries: 'industries',
  faq: 'faq',
} as const;

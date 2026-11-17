import type { AgentLanguage } from '@qualify/shared';

// Common Hindi words written in Roman letters. Deliberately excludes words that are also common
// English ("to", "me", "par", "hi") so English messages are not mistaken for Hinglish.
const HINGLISH_MARKERS = new Set([
  'hai',
  'hain',
  'ho',
  'hoga',
  'hogi',
  'tha',
  'thi',
  'kya',
  'kaise',
  'kab',
  'kahan',
  'kaha',
  'kitna',
  'kitne',
  'kitni',
  'nahi',
  'nahin',
  'mein',
  'mai',
  'main',
  'ke',
  'ka',
  'ki',
  'ko',
  'se',
  'aur',
  'bhi',
  'chahiye',
  'karna',
  'karenge',
  'kar',
  'karo',
  'kariye',
  'hum',
  'humein',
  'hamein',
  'aap',
  'aapka',
  'mujhe',
  'mera',
  'meri',
  'jaana',
  'jana',
  'jaenge',
  'jayenge',
  'haan',
  'han',
  'theek',
  'thik',
  'accha',
  'acha',
  'achha',
  'batao',
  'bataiye',
  'bataye',
  'rahe',
  'raha',
  'rahi',
  'wala',
  'wali',
  'sab',
  'kuch',
  'ji',
  'dosto',
  'doston',
  'saath',
  'sath',
  'bachha',
  'bachhe',
  'bacche',
  'saal',
  'yaar',
  'abhi',
  'lekin',
  'toh',
  'kyunki',
  'agar',
  'matlab',
  'chalega',
  'dekhte',
  'bolo',
  'sirf',
  'zyada',
  'kam',
  'paisa',
  'paise',
  'mahine',
  'mahina',
  'hafte',
  'din',
  'raat',
  'log',
  'logon',
  'ghumne',
  'plan',
]);
// "plan" is English too, but only counts alongside other markers (threshold below).

/**
 * Detects the language of a lead's message so the agent mirrors it reliably.
 * Returns null when the text is too short or ambiguous ("kerala", "2 adults", "25k"):
 * the caller then keeps the language used earlier in the conversation.
 */
export function detectLanguage(text: string): AgentLanguage | null {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return null;
  const devanagari = letters.filter((char) => /[ऀ-ॿ]/.test(char)).length;
  if (devanagari / letters.length >= 0.3) return 'hi';

  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length < 3) return null;
  const markers = words.filter((word) => HINGLISH_MARKERS.has(word)).length;
  if (markers >= 2 || markers / words.length >= 0.25) return 'hinglish';
  return 'en';
}

const REPLY_LANGUAGE_NAMES: Record<AgentLanguage, string> = {
  hinglish: 'Hinglish (Hindi in Roman letters)',
  en: 'English',
  hi: 'Hindi in Devanagari script',
};

export function describeReplyLanguage(language: AgentLanguage): string {
  return REPLY_LANGUAGE_NAMES[language];
}

/** Language to reply in: detected now, else the conversation's language, else the default; limited to allowed ones. */
export function chooseReplyLanguage(input: {
  latestLeadText: string | null;
  previous: string | null;
  allowed: readonly AgentLanguage[];
  fallback: AgentLanguage;
}): AgentLanguage {
  const detected = input.latestLeadText ? detectLanguage(input.latestLeadText) : null;
  const candidate = detected ?? (input.previous as AgentLanguage | null);
  return candidate && input.allowed.includes(candidate) ? candidate : input.fallback;
}

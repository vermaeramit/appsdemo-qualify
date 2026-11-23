import {
  BellRing,
  CheckCircle2,
  Code2,
  FileSpreadsheet,
  Globe,
  Hand,
  Megaphone,
  ScrollText,
  Webhook,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ScoreRing } from '../sections/hero';
import { WhatsAppIcon } from './icons';
import { GradeBadge } from './phone';

/** A counter that ticks while `play` is on (the scene is visible), for looping scene animations. */
function useTicker(play: boolean, every: number, length: number): number {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!play || reduced) return;
    const timer = window.setInterval(() => setTick((value) => (value + 1) % length), every);
    return () => window.clearInterval(timer);
  }, [play, reduced, every, length]);
  return reduced ? length - 1 : tick;
}

const SOURCES = [
  { icon: ScrollText, label: 'Meta lead form', tone: 'bg-blue-50 text-blue-600' },
  { icon: Megaphone, label: 'Click-to-WhatsApp ad', tone: 'bg-emerald-50 text-emerald-600' },
  { icon: Globe, label: 'Website / API', tone: 'bg-violet-50 text-violet-600' },
];

const ARRIVALS = [
  { name: 'Priya S.', source: 0, what: '2BHK in Whitefield' },
  { name: 'Rahul M.', source: 1, what: 'Bali package' },
  { name: 'Ananya K.', source: 2, what: 'MBA course fees' },
  { name: 'Vikram R.', source: 0, what: 'Dental implant' },
  { name: 'Meera J.', source: 1, what: 'Interior design' },
  { name: 'Arjun P.', source: 2, what: 'Solar panels quote' },
];

function ArriveScene({ play }: { play: boolean }) {
  const tick = useTicker(play, 1500, ARRIVALS.length);
  const visible = [0, 1, 2].map(
    (offset) => ARRIVALS[(tick - offset + ARRIVALS.length) % ARRIVALS.length]!,
  );
  const activeSource = visible[0]!.source;
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2">
        {SOURCES.map((source, index) => (
          <div
            key={source.label}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-center transition-all duration-500 ${
              index === activeSource
                ? 'scale-[1.03] border-indigo-300 bg-indigo-50/60 shadow-md'
                : 'border-line bg-white'
            }`}
          >
            <span className={`flex size-9 items-center justify-center rounded-xl ${source.tone}`}>
              <source.icon className="size-4.5" aria-hidden="true" />
            </span>
            <span className="text-[0.7rem] leading-tight font-medium text-ink-soft">
              {source.label}
            </span>
          </div>
        ))}
      </div>

      <div className="relative mx-auto my-3 h-14 w-0.5 overflow-hidden rounded-full bg-indigo-100">
        <motion.span
          className="absolute left-0 h-5 w-0.5 rounded-full bg-gradient-to-b from-transparent via-indigo-500 to-transparent"
          animate={play ? { top: ['-30%', '110%'] } : { top: '40%' }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeIn' }}
        />
      </div>

      <div className="flex-1 rounded-2xl border border-line bg-zinc-50/70 p-3">
        <p className="mb-2 flex items-center justify-between text-[0.7rem] font-semibold tracking-wide text-ink-faint uppercase">
          New leads
          <span className="flex items-center gap-1 text-emerald-600 normal-case">
            <span className="size-1.5 rounded-full bg-emerald-500" /> live
          </span>
        </p>
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {visible.map((lead, index) => {
              const source = SOURCES[lead.source]!;
              return (
                <motion.li
                  key={lead.name}
                  layout
                  initial={{ opacity: 0, y: -16, scale: 0.96 }}
                  animate={{ opacity: index === 2 ? 0.55 : 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5 shadow-sm"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[0.7rem] font-semibold text-indigo-700">
                    {lead.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{lead.name}</span>
                    <span className="block truncate text-xs text-ink-faint">{lead.what}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${source.tone}`}
                  >
                    {source.label.split(' ')[0]}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

function HelloScene({ play }: { play: boolean }) {
  // 0–5: counting seconds, 6+: the message is on the lead's phone.
  const tick = useTicker(play, 450, 16);
  const seconds = Math.min(tick, 6);
  const delivered = tick >= 6;
  return (
    <div className="flex h-full flex-col">
      <div className="rounded-2xl border border-line bg-zinc-50/70 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-ink-soft">
            <ScrollText className="size-4 text-blue-500" aria-hidden="true" /> Form submitted
          </span>
          <span className="font-mono text-xs text-ink-faint">10:41:52</span>
        </div>
        <div className="my-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
            animate={{ width: `${(seconds / 6) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span
            className={`flex items-center gap-2 transition-colors ${delivered ? 'text-emerald-700' : 'text-ink-faint'}`}
          >
            <WhatsAppIcon className="size-4" /> Reply on WhatsApp
          </span>
          <span className="font-mono text-xs font-semibold text-ink tabular-nums">{seconds} s</span>
        </div>
      </div>

      <div className="relative mt-4 flex-1 overflow-hidden rounded-[1.75rem] bg-gradient-to-b from-indigo-900 via-indigo-800 to-violet-900 p-4">
        <p className="text-center text-4xl font-light tracking-tight text-white/90 tabular-nums">
          10:41
        </p>
        <p className="text-center text-xs text-white/60">Tuesday</p>
        <AnimatePresence>
          {delivered && (
            <motion.div
              initial={{ opacity: 0, y: -24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="mt-5 rounded-2xl bg-white/90 p-3 shadow-xl backdrop-blur"
            >
              <div className="flex items-center gap-2 text-[0.7rem] text-zinc-500">
                <span className="flex size-5 items-center justify-center rounded-md bg-wa text-white">
                  <WhatsAppIcon className="size-3.5" />
                </span>
                WhatsApp
                <span className="ml-auto">now</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-zinc-900">Green Valley Homes</p>
              <p className="text-sm leading-snug text-zinc-700">
                Hi Priya! 👋 Thanks for your interest in our 2BHK homes. May I ask a few quick
                questions?
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const LANGUAGES = [
  {
    label: 'English',
    question: 'When would you like to move in?',
    buttons: ['Within 3 months', '3–6 months', 'Just exploring'],
  },
  {
    label: 'हिंदी',
    question: 'आप कब तक शिफ्ट होना चाहेंगे?',
    buttons: ['3 महीने में', '3–6 महीने', 'बस देख रहे हैं'],
  },
  {
    label: 'Hinglish',
    question: 'Aap kab tak shift hona chahenge?',
    buttons: ['3 months mein', '3–6 months', 'Abhi dekh rahe hain'],
  },
];

function AskScene({ play }: { play: boolean }) {
  // Each language: show (0), press the first button (1), hold (2).
  const tick = useTicker(play, 1100, LANGUAGES.length * 3);
  const language = LANGUAGES[Math.floor(tick / 3)]!;
  const pressed = tick % 3 >= 1;
  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center gap-1.5">
        {LANGUAGES.map((item) => (
          <span
            key={item.label}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ${
              item.label === language.label
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-zinc-100 text-ink-faint'
            }`}
          >
            {item.label}
          </span>
        ))}
      </div>
      <div className="bg-wa-wallpaper mt-4 flex flex-1 flex-col justify-end gap-1.5 rounded-2xl p-3">
        <div className="max-w-[85%] self-end rounded-xl rounded-tr-sm bg-wa-out px-2.5 py-1.5 text-[0.8rem] text-zinc-900 shadow-sm">
          For myself
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={language.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-col gap-1"
          >
            <div className="max-w-[85%] self-start rounded-xl rounded-tl-sm bg-white px-2.5 py-1.5 text-[0.8rem] text-zinc-900 shadow-sm">
              {language.question}
            </div>
            {language.buttons.map((label, index) => (
              <span
                key={label}
                className={`max-w-[85%] rounded-xl px-3 py-1.5 text-center text-[0.78rem] font-medium shadow-sm transition-colors duration-300 ${
                  pressed && index === 0 ? 'bg-wa-out text-wa-deep' : 'bg-white text-wa-link'
                }`}
              >
                {label}
              </span>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="mt-3 text-center text-xs text-ink-faint">
        One question at a time · tap to answer · in their language
      </p>
    </div>
  );
}

const BREAKDOWN = [
  { label: 'Timeline · within 3 months', points: 25 },
  { label: 'Budget · ₹85 L', points: 20 },
  { label: 'Purpose · for myself', points: 11 },
  { label: 'AI intent · ready to visit', points: 30 },
];

function ScoreScene({ play }: { play: boolean }) {
  const tick = useTicker(play, 900, 9);
  const shownRows = Math.min(tick, BREAKDOWN.length);
  const total = BREAKDOWN.slice(0, shownRows).reduce((sum, row) => sum + row.points, 0);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-5 rounded-2xl border border-line bg-zinc-50/70 p-4">
        <ScoreRing
          value={total}
          color={total >= 80 ? 'var(--color-hot)' : 'var(--color-warm)'}
          size={88}
        />
        <div>
          <p className="text-sm font-semibold text-ink">Priya S.</p>
          <p className="text-xs text-ink-faint">Meta lead form · 2BHK</p>
          <div className="mt-2 h-6">
            <AnimatePresence>
              {total >= 80 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-block"
                >
                  <GradeBadge grade="Hot" score={total} />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-2.5">
        {BREAKDOWN.map((row, index) => (
          <li
            key={row.label}
            className={`transition-opacity duration-300 ${index < shownRows ? 'opacity-100' : 'opacity-35'}`}
          >
            <div className="flex justify-between text-xs">
              <span className="text-ink-soft">{row.label}</span>
              <span className="font-semibold text-ink tabular-nums">+{row.points}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <motion.div
                className={`h-full rounded-full ${index === 3 ? 'bg-violet-500' : 'bg-indigo-500'}`}
                animate={{ width: index < shownRows ? `${(row.points / 30) * 100}%` : '0%' }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-auto rounded-xl bg-indigo-50/70 p-3 text-xs leading-relaxed text-indigo-900">
        <span className="font-semibold">Summary:</span> 2BHK in Whitefield for herself, moving
        within 3 months, budget about ₹85 L. Wants a site visit this weekend.
      </p>
    </div>
  );
}

const DELIVERIES = [
  {
    icon: BellRing,
    tone: 'bg-rose-50 text-rose-600',
    title: 'Hot lead · Priya S. · 86',
    body: 'Sent to your sales team with the full chat',
  },
  {
    icon: Webhook,
    tone: 'bg-indigo-50 text-indigo-600',
    title: 'Webhook → your CRM',
    body: 'lead.qualified delivered · 200 OK',
  },
  {
    icon: FileSpreadsheet,
    tone: 'bg-emerald-50 text-emerald-600',
    title: 'Daily report e-mailed',
    body: 'Excel attached, hottest leads on top',
  },
  {
    icon: Hand,
    tone: 'bg-amber-50 text-amber-600',
    title: 'Rohan replied from WhatsApp',
    body: 'The AI stepped back for this lead',
  },
];

function DeliverScene({ play }: { play: boolean }) {
  const tick = useTicker(play, 1200, DELIVERIES.length + 3);
  const shown = Math.min(tick + 1, DELIVERIES.length);
  return (
    <div className="flex h-full flex-col">
      <ul className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {DELIVERIES.slice(0, shown).map((item) => (
            <motion.li
              key={item.title}
              layout
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm"
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}
              >
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                <span className="block truncate text-xs text-ink-faint">{item.body}</span>
              </span>
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-auto flex items-center justify-center gap-4 pt-4 text-ink-faint">
        <FileSpreadsheet className="size-5" aria-label="Excel" />
        <Webhook className="size-5" aria-label="Webhooks" />
        <Code2 className="size-5" aria-label="API" />
        <WhatsAppIcon className="size-5" />
      </div>
    </div>
  );
}

const SCENES = {
  arrive: ArriveScene,
  hello: HelloScene,
  ask: AskScene,
  score: ScoreScene,
  deliver: DeliverScene,
} as const;

export type SceneId = keyof typeof SCENES;

export function Scene({ id, play }: { id: string; play: boolean }) {
  const Component = SCENES[id as SceneId];
  return Component ? <Component play={play} /> : null;
}

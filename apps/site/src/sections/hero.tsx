import { ArrowDown, BadgeCheck, Clock3, Sparkles, Zap } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { WhatsAppIcon } from '../components/icons';
import { GRADE_STYLES } from '../components/grades';
import { Bubble, GradeBadge, PhoneFrame, ReplyButtons, Typing } from '../components/phone';
import { useReducedMotion } from '../components/reduced-motion';
import { demoHref } from '../config';
import { type ChatEvent, DEMO_CHATS, type DemoChat } from '../content';

interface PlayerState {
  chat: number;
  shown: number;
  typing: boolean;
  tapping: string | null;
}

/**
 * Plays the chats one after another (one chat replays itself). The first chat starts complete
 * (the same on the server and in the browser, so hydration matches), then the chats play message by
 * message.
 */
function useChatPlayer(chats: readonly DemoChat[]): PlayerState {
  const reduced = useReducedMotion();
  const [state, setState] = useState<PlayerState>({
    chat: 0,
    shown: chats[0]!.events.length,
    typing: false,
    tapping: null,
  });

  useEffect(() => {
    if (reduced) return;
    const timers: number[] = [];
    const at = (ms: number, update: (current: PlayerState) => PlayerState) =>
      timers.push(window.setTimeout(() => setState(update), ms));

    function play(chat: number) {
      timers.length = 0;
      const events = chats[chat]!.events;
      setState({ chat, shown: 0, typing: false, tapping: null });
      let t = 0;
      events.forEach((event, index) => {
        const shown = (s: PlayerState): PlayerState => ({
          ...s,
          shown: index + 1,
          typing: false,
          tapping: null,
        });
        if (event.kind === 'ai') {
          t += 450;
          at(t, (s) => ({ ...s, typing: true }));
          t += 1100;
          at(t, shown);
        } else if (event.kind === 'tap') {
          t += 900;
          at(t, (s) => ({ ...s, tapping: event.text }));
          t += 450;
          at(t, shown);
        } else {
          t += index === 0 ? 350 : event.kind === 'score' ? 700 : 1300;
          at(t, shown);
        }
      });
      timers.push(window.setTimeout(() => play((chat + 1) % chats.length), t + 4200));
    }

    timers.push(window.setTimeout(() => play(1 % chats.length), 3800));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduced, chats]);

  return state;
}

function ChatScreen({ events, state }: { events: ChatEvent[]; state: PlayerState }) {
  const visible = events.slice(0, state.shown);
  return (
    <>
      {visible.map((event, index) => {
        if (event.kind === 'lead' || event.kind === 'tap') {
          return (
            <Bubble key={index} from="lead" note={event.kind === 'lead' ? event.note : undefined}>
              {event.text}
            </Bubble>
          );
        }
        if (event.kind === 'ai') {
          const next = events[index + 1];
          const chosen = next?.kind === 'tap' && index + 1 < state.shown ? next.text : null;
          const pressing = index === state.shown - 1 ? state.tapping : null;
          return (
            <div key={index} className="flex flex-col gap-1">
              <Bubble from="business">{event.text}</Bubble>
              {event.buttons && (
                <ReplyButtons buttons={event.buttons} tapped={pressing ?? chosen} />
              )}
            </div>
          );
        }
        return null;
      })}
      {state.typing && <Typing />}
    </>
  );
}

/** A phone playing WhatsApp chats that end with the lead's score card. */
export function ChatPhone({ chats }: { chats: readonly DemoChat[] }) {
  const state = useChatPlayer(chats);
  const chat = chats[state.chat]!;
  const score = chat.events.slice(0, state.shown).find((event) => event.kind === 'score');

  return (
    <div
      className="relative mx-auto w-full max-w-[330px] sm:max-w-[350px]"
      role="img"
      aria-label="Example: a lead from an ad chats with the business on WhatsApp, answers a few questions with buttons, and is scored as a Hot lead."
    >
      <div className="absolute -inset-x-16 -inset-y-10 -z-10 rounded-full bg-[radial-gradient(closest-side,oklch(0.6_0.2_277/0.25),transparent)] blur-2xl" />

      <div className="mb-3 flex h-7 justify-center">
        <AnimatePresence mode="wait">
          <motion.span
            key={chat.industry}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/80 px-3 py-1 text-xs font-medium text-ink-soft shadow-sm backdrop-blur"
          >
            <Sparkles className="size-3.5 text-indigo-500" aria-hidden="true" />
            Example · {chat.industry}
          </motion.span>
        </AnimatePresence>
      </div>

      <PhoneFrame
        business={chat.business}
        initials={chat.initials}
        status={state.typing ? 'typing…' : 'online'}
        className="h-[540px] sm:h-[580px]"
      >
        <ChatScreen key={state.chat} events={chat.events} state={state} />
      </PhoneFrame>

      <div className="animate-float absolute top-[46%] -left-6 hidden items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-xs shadow-lg sm:flex lg:-left-16">
        <span className="flex size-7 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <Clock3 className="size-4" aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className="block font-semibold text-ink">First reply</span>
          <span className="text-ink-faint">in seconds, 24×7</span>
        </span>
      </div>

      <AnimatePresence>
        {score?.kind === 'score' && (
          <motion.div
            key={state.chat}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="absolute right-0 -bottom-8 left-0 mx-auto w-[88%] rounded-2xl border border-line bg-white p-3.5 shadow-[0_20px_50px_-12px_rgb(30_27_75/0.35)] sm:-right-10 sm:left-auto sm:w-64 lg:-right-20"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.7rem] font-medium tracking-wide text-ink-faint uppercase">
                Lead scored
              </span>
              <GradeBadge grade={score.grade} score={score.score} />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ScoreRing value={score.score} color={GRADE_STYLES[score.grade].ring} />
              <div className="flex min-w-0 flex-wrap gap-1">
                {score.facts.map((fact) => (
                  <span
                    key={fact}
                    className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[0.65rem] text-ink-soft"
                  >
                    {fact}
                  </span>
                ))}
              </div>
            </div>
            <p className="mt-2.5 flex items-center gap-1.5 border-t border-line pt-2 text-[0.7rem] font-medium text-wa-deep">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Sent to your sales team
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ScoreRing({
  value,
  color,
  size = 48,
}: {
  value: number;
  color: string;
  size?: number;
}) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="oklch(0.94 0.005 277)"
          strokeWidth="5"
        />
        <motion.circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - value / 100) }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
        />
      </svg>
      <span className="text-sm font-semibold text-ink tabular-nums">{value}</span>
    </span>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 -z-20 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-40 left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.75_0.12_277/0.35),transparent)]" />
      <div className="absolute top-40 -right-40 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,oklch(0.85_0.15_150/0.35),transparent)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-28 pb-24 sm:px-6 md:pt-36 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pb-32">
        <div className="text-center lg:text-left">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/70 px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm backdrop-blur"
          >
            <span className="relative flex size-2">
              <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-wa" />
              <span className="relative inline-flex size-2 rounded-full bg-wa" />
            </span>
            AI lead qualification on WhatsApp
          </motion.p>

          <h1 className="mt-5 text-[2.35rem] leading-[1.06] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-[3.55rem]">
            Every lead qualified on WhatsApp,{' '}
            <span className="text-gradient">before your team picks up the phone.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[1.06rem] leading-relaxed text-pretty text-ink-soft lg:mx-0 lg:text-lg">
            An AI agent on your own WhatsApp number replies to every lead from your ads, forms and
            website in seconds. It asks your questions, scores each lead{' '}
            <strong className="font-semibold text-hot">Hot</strong>,{' '}
            <strong className="font-semibold text-[oklch(0.6_0.15_65)]">Warm</strong> or{' '}
            <strong className="font-semibold text-cold">Cold</strong>, and sends your team only the
            ones worth calling.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href={demoHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-wa-deep px-6 py-3.5 text-[0.95rem] font-semibold text-white shadow-[0_10px_30px_-8px_rgb(0_128_105/0.6)] transition hover:-translate-y-0.5 hover:bg-[#006d59] sm:w-auto"
            >
              <WhatsAppIcon className="size-5" />
              Try it on WhatsApp
            </a>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-6 py-3.5 text-[0.95rem] font-semibold text-ink transition hover:border-indigo-200 hover:bg-indigo-50/50 sm:w-auto"
            >
              See how it works
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-ink-faint lg:justify-start">
            <Zap className="size-4 text-amber-500" aria-hidden="true" />
            <span>
              Message our AI agent and watch it qualify{' '}
              <span className="font-medium text-ink-soft">you</span>, live.
            </span>
          </p>

          <ul className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-soft lg:justify-start">
            {[
              'Official WhatsApp Business Platform',
              'Works on your own number',
              'Live in a day',
            ].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-indigo-500" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <ChatPhone chats={DEMO_CHATS} />
      </div>
    </section>
  );
}

import { Gauge, Inbox, ListChecks, MessageCircle, Users } from 'lucide-react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Scene } from '../components/scenes';
import { SectionHeading } from '../components/section';
import { STEPS, type Step } from '../content';

const NODES = [
  { icon: Inbox, label: 'Lead arrives' },
  { icon: MessageCircle, label: 'AI says hi' },
  { icon: ListChecks, label: 'Asks questions' },
  { icon: Gauge, label: 'Scores' },
  { icon: Users, label: 'Team closes' },
];

/** The whole journey at a glance: a pulse runs from the ad to your team, over and over. */
function Pipeline() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '0px 0px -10% 0px' });
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const timer = window.setInterval(
      () => setActive((value) => (value + 1) % (NODES.length + 1)),
      1100,
    );
    return () => window.clearInterval(timer);
  }, [reduced, inView]);

  const reached = reduced ? NODES.length - 1 : Math.min(active, NODES.length - 1);
  return (
    <div ref={ref} className="relative mx-auto mt-14 max-w-4xl">
      <div className="absolute top-6 right-[10%] left-[10%] h-0.5 rounded-full bg-white/10 sm:top-7" />
      <motion.div
        className="absolute top-6 left-[10%] h-0.5 rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400 sm:top-7"
        animate={{ width: `${reached * 20}%` }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      />
      <motion.span
        className="absolute top-6 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_18px_6px_rgb(129_140_248/0.7)] sm:top-7"
        animate={{ left: `${10 + reached * 20}%` }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        aria-hidden="true"
      />
      <ol className="relative grid grid-cols-5">
        {NODES.map((node, index) => {
          const done = index <= reached;
          return (
            <li key={node.label} className="flex flex-col items-center gap-2.5 text-center">
              <span
                className={`relative flex size-12 items-center justify-center rounded-2xl border transition-all duration-500 sm:size-14 ${
                  done
                    ? 'border-indigo-300/60 bg-indigo-500 text-white shadow-[0_0_30px_-4px_rgb(129_140_248/0.8)]'
                    : 'border-white/10 bg-white/5 text-indigo-200/60'
                }`}
              >
                <node.icon className="size-5 sm:size-6" aria-hidden="true" />
              </span>
              <span
                className={`text-[0.68rem] leading-tight font-medium transition-colors sm:text-sm ${done ? 'text-white' : 'text-indigo-200/50'}`}
              >
                {node.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SceneCard({
  id,
  play,
  compact = false,
}: {
  id: string;
  play: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.75rem] border border-white/10 bg-white p-4 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)] sm:p-5 ${
        compact ? 'h-[400px]' : 'h-[470px]'
      }`}
    >
      <Scene id={id} play={play} />
    </div>
  );
}

function StepItem({
  step,
  index,
  active,
  onActive,
}: {
  step: Step;
  index: number;
  active: boolean;
  onActive: (index: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  // Active while the step crosses the middle of the screen.
  const centred = useInView(ref, { margin: '-48% 0px -48% 0px' });
  const visible = useInView(ref, { amount: 0.3 });
  useEffect(() => {
    if (centred) onActive(index);
  }, [centred, onActive, index]);

  return (
    <li ref={ref} className="flex flex-col justify-center py-6 md:min-h-[68vh] md:py-0">
      <div
        className={`transition-opacity duration-500 ${active ? 'md:opacity-100' : 'md:opacity-40'}`}
      >
        <span
          className={`inline-flex size-9 items-center justify-center rounded-xl text-sm font-semibold transition-colors duration-500 ${
            active ? 'bg-indigo-500 text-white' : 'bg-white/10 text-indigo-200'
          }`}
        >
          {index + 1}
        </span>
        <h3 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">
          {step.title}
        </h3>
        <p className="mt-3 max-w-md text-[1.02rem] leading-relaxed text-indigo-100/75">
          {step.body}
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {step.points.map((point) => (
            <li
              key={point}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-indigo-100"
            >
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-7 md:hidden">
        <SceneCard id={step.id} play={visible} compact />
      </div>
    </li>
  );
}

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const current = STEPS[active]!;

  return (
    <section
      id="how-it-works"
      className="relative overflow-x-clip bg-[oklch(0.16_0.03_277)] py-24 md:py-32"
    >
      <div className="bg-grid-dark absolute inset-0 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-32 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.5_0.2_277/0.45),transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          dark
          eyebrow="How it works"
          title="From ad click to sales-ready, on autopilot"
          body="Five steps run for every lead, the moment it arrives. Your team only steps in for the conversations that matter."
        />
        <Pipeline />

        <div className="mt-10 grid gap-4 md:mt-28 md:grid-cols-2 md:gap-16">
          <div className="hidden md:block">
            <div className="sticky top-[max(6rem,calc(50vh-16rem))]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.98 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <SceneCard id={current.id} play />
                </motion.div>
              </AnimatePresence>
              <div className="mt-5 flex justify-center gap-2" aria-hidden="true">
                {STEPS.map((step, index) => (
                  <span
                    key={step.id}
                    className={`h-1.5 rounded-full transition-all duration-500 ${index === active ? 'w-8 bg-indigo-400' : 'w-1.5 bg-white/20'}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <ol data-steps>
            {STEPS.map((step, index) => (
              <StepItem
                key={step.id}
                step={step}
                index={index}
                active={index === active}
                onActive={setActive}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

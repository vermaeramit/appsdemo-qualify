import {
  ArrowRight,
  Code2,
  FileSpreadsheet,
  Globe,
  Hourglass,
  Mail,
  Megaphone,
  MessageCircle,
  PhoneOff,
  ScrollText,
  Shuffle,
  Webhook,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Reveal, SectionHeading } from '../components/section';

const SOURCES = [
  { icon: ScrollText, label: 'Meta lead forms' },
  { icon: Megaphone, label: 'Click-to-WhatsApp ads' },
  { icon: Globe, label: 'Website forms' },
  { icon: Code2, label: 'REST API' },
  { icon: MessageCircle, label: 'WhatsApp chats' },
  { icon: FileSpreadsheet, label: 'Excel export' },
  { icon: Webhook, label: 'Webhooks to any CRM' },
  { icon: Mail, label: 'E-mail reports' },
];

/** A slow, endless strip of where leads come from and where results go. */
export function SourcesStrip() {
  const items = [...SOURCES, ...SOURCES];
  return (
    <div className="relative border-y border-line bg-white/60 py-5">
      <p className="sr-only">Works with: {SOURCES.map((source) => source.label).join(', ')}</p>
      <div
        className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
        aria-hidden="true"
      >
        <div className="animate-marquee flex w-max gap-10 pr-10">
          {items.map((source, index) => (
            <span
              key={index}
              className="flex items-center gap-2 text-sm font-medium whitespace-nowrap text-ink-faint"
            >
              <source.icon className="size-4 text-indigo-400" />
              {source.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const PROBLEMS = [
  {
    icon: Hourglass,
    problem: 'Leads wait hours for a call',
    detail: 'By the time someone calls, the lead has forgotten the ad or found someone faster.',
    fix: 'Every lead hears from you in seconds, on WhatsApp, day or night.',
  },
  {
    icon: PhoneOff,
    problem: 'Your team calls everyone',
    detail: 'Most of the day goes to people who were just curious, while serious buyers wait.',
    fix: 'Your team calls only the Hot leads, already qualified, with the full chat.',
  },
  {
    icon: Shuffle,
    problem: 'Nobody knows which ad works',
    detail: 'Leads from every form and campaign end up in one sheet, with no idea which ones buy.',
    fix: 'Every lead keeps its ad, form and score, so you can put money where buyers come from.',
  },
];

export function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHeading
        eyebrow="Why it matters"
        title="Most leads go cold before anyone calls"
        body="You pay for every lead. The first few minutes decide whether it turns into a sale or a missed call."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {PROBLEMS.map((item, index) => (
          <Reveal key={item.problem} delay={index * 0.08}>
            <article className="group flex h-full flex-col rounded-3xl border border-line bg-white p-6 shadow-[0_1px_2px_rgb(0_0_0/0.03)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-20px_rgb(30_27_75/0.25)]">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{item.problem}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{item.detail}</p>
              <div className="mt-auto pt-6">
                <motion.p
                  className="flex items-start gap-2 rounded-2xl bg-emerald-50/80 p-3.5 text-sm leading-snug font-medium text-emerald-800"
                  whileHover={{ x: 2 }}
                >
                  <ArrowRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {item.fix}
                </motion.p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

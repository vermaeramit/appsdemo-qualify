import { ArrowRight, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ICONS } from '../components/icons';
import { GradeBadge } from '../components/phone';
import { Reveal, SectionHeading } from '../components/section';
import { FEATURES, INDUSTRIES, OUTPUTS, SETUP } from '../content';

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHeading
        eyebrow="Features"
        title="Everything you need to qualify every lead"
        body="Built for businesses that run ads and get more leads than their team can call."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, index) => {
          const Icon = ICONS[feature.icon]!;
          return (
            <Reveal key={feature.title} delay={(index % 3) * 0.06}>
              <article className="group relative h-full overflow-hidden rounded-3xl border border-line bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_24px_50px_-24px_rgb(79_70_229/0.35)]">
                <div className="absolute -top-16 -right-16 size-40 rounded-full bg-indigo-100/0 transition duration-500 group-hover:bg-indigo-100/60" />
                <span className="relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_8px_20px_-6px_rgb(99_102_241/0.6)]">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="relative mt-5 text-[1.05rem] font-semibold tracking-tight text-ink">
                  {feature.title}
                </h3>
                <p className="relative mt-2 text-[0.94rem] leading-relaxed text-ink-soft">
                  {feature.body}
                </p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function Industries() {
  const [selected, setSelected] = useState(INDUSTRIES[0]!.id);
  const industry = INDUSTRIES.find((item) => item.id === selected) ?? INDUSTRIES[0]!;

  return (
    <section id="industries" className="border-y border-line bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Industries"
          title="Ready-made agents for your industry"
          body="Start from a template with the right questions and scoring, then make it yours: wording, order, tone and rules."
        />

        <div
          className="mx-auto mt-12 flex max-w-full flex-wrap justify-center gap-1.5 rounded-3xl border border-line bg-zinc-50 p-1.5 sm:w-fit sm:flex-nowrap sm:rounded-full"
          role="tablist"
          aria-label="Industries"
        >
          {INDUSTRIES.map((item) => {
            const Icon = ICONS[item.icon]!;
            const isSelected = item.id === selected;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls="industry-panel"
                onClick={() => setSelected(item.id)}
                className={`relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isSelected ? 'text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {isSelected && (
                  <motion.span
                    layoutId="industry-pill"
                    className="absolute inset-0 rounded-full bg-ink"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <Icon className="relative size-4" aria-hidden="true" />
                <span className="relative">{item.name}</span>
              </button>
            );
          })}
        </div>

        <div id="industry-panel" role="tabpanel" className="mx-auto mt-10 max-w-4xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={industry.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]"
            >
              <div className="rounded-3xl border border-line bg-zinc-50/60 p-6">
                <p className="text-sm font-semibold text-ink">The ready-made agent asks</p>
                <ol className="mt-4 flex flex-col gap-2.5">
                  {industry.questions.map((question, index) => (
                    <motion.li
                      key={question}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 + index * 0.06 }}
                      className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[0.95rem] text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-line"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600">
                        {index + 1}
                      </span>
                      {question}
                    </motion.li>
                  ))}
                </ol>
                {industry.page && (
                  <a
                    href={industry.page}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    More about {industry.name.toLowerCase()}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </a>
                )}
              </div>
              <div className="flex flex-col rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-[0_30px_60px_-24px_rgb(79_70_229/0.6)]">
                <p className="text-sm font-semibold text-indigo-100">Your team receives</p>
                <div className="mt-4 rounded-2xl bg-white p-4 text-ink">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{industry.outcome.name}</span>
                    <GradeBadge grade={industry.outcome.grade} score={industry.outcome.score} />
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {industry.outcome.summary}
                  </p>
                </div>
                <ul className="mt-5 flex flex-col gap-2 text-sm text-indigo-50">
                  {[
                    'Every answer in its own column',
                    'The full WhatsApp chat',
                    'The ad or form it came from',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-300" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

export function Outputs() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHeading
        eyebrow="Fits your tools"
        title="Not another CRM. It feeds the one you have."
        body="Qualification is all it does, and it hands the results to the tools your team already uses."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {OUTPUTS.map((output, index) => {
          const Icon = ICONS[output.icon]!;
          return (
            <Reveal key={output.title} delay={index * 0.06}>
              <article className="h-full rounded-3xl border border-line bg-white p-6">
                <Icon className="size-7 text-indigo-600" aria-hidden="true" />
                <h3 className="mt-4 font-semibold tracking-tight text-ink">{output.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{output.body}</p>
              </article>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-24">
        <SectionHeading eyebrow="Getting started" title="Live in a day" />
        <ol className="relative mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
          <div className="absolute top-5 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-indigo-200 via-violet-200 to-emerald-200 md:block" />
          {SETUP.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.1} className="relative">
              <li className="flex gap-4 md:flex-col md:items-center md:text-center">
                <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white ring-8 ring-paper">
                  {index + 1}
                </span>
                <span>
                  <span className="block font-semibold text-ink md:mt-4">{step.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
                    {step.body}
                  </span>
                </span>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

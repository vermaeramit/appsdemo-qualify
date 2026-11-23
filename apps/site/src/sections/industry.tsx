import { findTemplate } from '@qualify/core';
import { ArrowDown, ArrowRight, Hand, ShieldCheck, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { GRADE_STYLES } from '../components/grades';
import { ICONS, WhatsAppIcon } from '../components/icons';
import { GradeBadge } from '../components/phone';
import { Reveal, SectionHeading } from '../components/section';
import { demoHref } from '../config';
import { INDUSTRY_PAGES, type IndustryPage } from '../industries';
import { ChatPhone, ScoreRing } from './hero';
import { SourcesStrip } from './problem';

/** An industry page (D-104): the same product, told through one industry's ready-made agent. */
export function IndustryView({ page }: { page: IndustryPage }) {
  return (
    <>
      <IndustryHero page={page} />
      <SourcesStrip />
      <Pains page={page} />
      <Questions page={page} />
      <Scoring page={page} />
      <Guardrails page={page} />
    </>
  );
}

// One stable list per page: the phone restarts its animation when the list changes.
const CHATS = new Map(INDUSTRY_PAGES.map((page) => [page.slug, [page.demo]]));

function IndustryHero({ page }: { page: IndustryPage }) {
  const Icon = ICONS[page.icon]!;
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 -z-20 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-40 left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.75_0.12_277/0.35),transparent)]" />
      <div className="absolute top-40 -right-40 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,oklch(0.85_0.15_150/0.35),transparent)]" />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-28 pb-24 sm:px-6 md:pt-36 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:pb-32">
        <div className="text-center lg:text-left">
          <nav aria-label="Breadcrumb" className="mb-5 text-xs text-ink-faint">
            <ol className="flex flex-wrap items-center justify-center gap-1.5 lg:justify-start">
              <li>
                <a href="/" className="hover:text-indigo-600">
                  Home
                </a>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <a href="/#industries" className="hover:text-indigo-600">
                  Industries
                </a>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="font-medium text-ink-soft">
                {page.name}
              </li>
            </ol>
          </nav>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-white/70 px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm backdrop-blur"
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {page.eyebrow}
          </motion.p>

          <h1 className="mt-5 text-[2.2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-[3.3rem]">
            {page.headline} <span className="text-gradient">{page.headlineAccent}</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-[1.06rem] leading-relaxed text-pretty text-ink-soft lg:mx-0 lg:text-lg">
            {page.intro}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href={demoHref(page.demoMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-wa-deep px-6 py-3.5 text-[0.95rem] font-semibold text-white shadow-[0_10px_30px_-8px_rgb(0_128_105/0.6)] transition hover:-translate-y-0.5 hover:bg-[#006d59] sm:w-auto"
            >
              <WhatsAppIcon className="size-5" />
              Try it on WhatsApp
            </a>
            <a
              href="#questions"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-6 py-3.5 text-[0.95rem] font-semibold text-ink transition hover:border-indigo-200 hover:bg-indigo-50/50 sm:w-auto"
            >
              See what it asks
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
        </div>

        <ChatPhone chats={CHATS.get(page.slug)!} />
      </div>
    </section>
  );
}

function Pains({ page }: { page: IndustryPage }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHeading eyebrow="The problem" title={page.painsTitle} />
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {page.pains.map((pain, index) => (
          <Reveal key={pain.title} delay={index * 0.08}>
            <article className="h-full rounded-3xl border border-line bg-white p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-600">
                {index + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{pain.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{pain.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Questions({ page }: { page: IndustryPage }) {
  return (
    <section id="questions" className="border-y border-line bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="The conversation"
          title="What the agent asks"
          body={`The ready-made ${page.agentNoun} agent asks these one at a time, in the lead’s language, with tap-to-answer buttons where there are choices. Change the wording, order and options, or add your own questions.`}
        />
        <ol className="mx-auto mt-12 grid max-w-5xl gap-3 md:grid-cols-2">
          {page.questions.map((question, index) => (
            <Reveal key={question.key} delay={(index % 2) * 0.05}>
              <li className="flex h-full gap-3 rounded-2xl border border-line bg-zinc-50/60 p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-medium text-ink">{question.question}</span>
                    <span
                      className={`text-[0.7rem] font-semibold tracking-wide uppercase ${
                        question.required ? 'text-indigo-600' : 'text-ink-faint'
                      }`}
                    >
                      {question.required ? 'Required' : 'Optional'}
                    </span>
                  </span>
                  {question.options.length > 0 && (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {question.options.map((option) => (
                        <span
                          key={option}
                          className="rounded-full bg-white px-2.5 py-1 text-xs text-wa-link ring-1 ring-line"
                        >
                          {option}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            </Reveal>
          ))}
        </ol>
        <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-ink-faint">
          Answers that came with a lead form can be confirmed instead of asked again.
        </p>
      </div>
    </section>
  );
}

function Scoring({ page }: { page: IndustryPage }) {
  const { scoring, result } = page;
  return (
    <section id="scoring" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <SectionHeading
        eyebrow="Scoring"
        title="How every lead gets its score"
        body="Points from the answers, plus the intent the AI reads in the chat. These are the ready-made rules; change any of them and every lead is rescored."
      />
      <div className="mt-14 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Reveal>
          <div className="h-full rounded-3xl border border-line bg-white p-6">
            <p className="text-sm font-semibold text-ink">Points for each answer</p>
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {page.scoringRows.map((row) => (
                <li key={row.label} className="py-3.5 first:pt-0">
                  <p className="text-[0.95rem] font-medium text-ink">{row.label}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.values.map((value) => (
                      <span
                        key={value.label}
                        className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-ink-soft"
                      >
                        {value.label}
                        <span className="font-semibold text-ink tabular-nums">+{value.points}</span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-3.5">
                <span className="text-[0.95rem] font-medium text-ink">
                  All required questions answered
                </span>
                <span className="text-sm font-semibold text-ink tabular-nums">
                  +{scoring.completePoints}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-3.5 last:pb-0">
                <span className="text-[0.95rem] font-medium text-ink">
                  Intent the AI reads in the chat
                </span>
                <span className="text-sm font-semibold text-ink tabular-nums">
                  up to +{scoring.aiMaxPoints}
                </span>
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-50 p-3 text-xs text-ink-soft">
              <GradeBadge grade="Hot" />
              <span>{scoring.hotAt} and above</span>
              <span className="mx-1 text-line" aria-hidden="true">
                |
              </span>
              <GradeBadge grade="Warm" />
              <span>
                {scoring.warmAt}–{scoring.hotAt - 1}
              </span>
              <span className="mx-1 text-line" aria-hidden="true">
                |
              </span>
              <GradeBadge grade="Cold" />
              <span>below {scoring.warmAt}</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="flex h-full flex-col rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-[0_30px_60px_-24px_rgb(79_70_229/0.6)]">
            <p className="text-sm font-semibold text-indigo-100">Example</p>
            <div className="mt-4 rounded-2xl bg-white p-4 text-ink">
              <div className="flex items-center gap-3">
                <ScoreRing value={result.score} color={GRADE_STYLES[result.grade].ring} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{page.example.name}</span>
                    <GradeBadge grade={result.grade} score={result.score} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    {page.example.summary}
                  </p>
                </div>
              </div>
              <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
                {result.rows.map((row) => (
                  <li key={row.label} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-soft">{row.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums">+{row.points}</span>
                  </li>
                ))}
                <li className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 font-semibold">
                  <span>Score</span>
                  <span className="tabular-nums">{result.score}</span>
                </li>
              </ul>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-indigo-100/85">
              Calculated with the product’s scoring engine and the rules on this page.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Guardrails({ page }: { page: IndustryPage }) {
  return (
    <section className="border-y border-line bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Guardrails"
          title="It knows what not to say"
          body={`Every agent follows plain-language rules you can edit. These come with the ${page.agentNoun} agent.`}
        />
        <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-3xl border border-line bg-zinc-50/60 p-6">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <ShieldCheck className="size-5 text-indigo-600" aria-hidden="true" />
                Rules it follows
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {page.guardrails.map((rule) => (
                  <li key={rule} className="text-[0.95rem] leading-relaxed text-ink-soft">
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="h-full rounded-3xl border border-line bg-zinc-50/60 p-6">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Hand className="size-5 text-indigo-600" aria-hidden="true" />
                Hands the chat to your team when
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {page.handoff.map((trigger) => (
                  <li key={trigger} className="text-[0.95rem] leading-relaxed text-ink-soft">
                    {trigger}
                  </li>
                ))}
                <li className="text-[0.95rem] leading-relaxed text-ink-soft">
                  Your team replies from the WhatsApp app: the AI steps back by itself.
                </li>
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** Links to the other industry pages, and to the home page's "any business" agent. */
export function OtherIndustries({ current }: { current: IndustryPage['slug'] }) {
  const others = INDUSTRY_PAGES.filter((page) => page.slug !== current);
  const Briefcase = ICONS.briefcase!;
  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 pb-4 sm:px-6 md:pt-32">
      <SectionHeading eyebrow="Other industries" title="Ready-made agents for other businesses" />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {others.map((page, index) => {
          const Icon = ICONS[page.icon]!;
          return (
            <Reveal key={page.slug} delay={index * 0.06}>
              <a
                href={`/${page.slug}`}
                className="group flex h-full flex-col rounded-3xl border border-line bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_20px_40px_-24px_rgb(79_70_229/0.35)]"
              >
                <Icon className="size-6 text-indigo-600" aria-hidden="true" />
                <span className="mt-4 font-semibold text-ink">{page.name}</span>
                <span className="mt-1 flex-1 text-sm leading-relaxed text-ink-soft">
                  {page.templateSummary}
                </span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
                  See the page
                  <ArrowRight
                    className="size-4 transition group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </a>
            </Reveal>
          );
        })}
        <Reveal delay={others.length * 0.06}>
          <a
            href="/#industries"
            className="group flex h-full flex-col rounded-3xl border border-dashed border-line bg-zinc-50/60 p-5 transition hover:border-indigo-200"
          >
            <Briefcase className="size-6 text-indigo-600" aria-hidden="true" />
            <span className="mt-4 font-semibold text-ink">Any business</span>
            <span className="mt-1 flex-1 text-sm leading-relaxed text-ink-soft">
              {findTemplate('general').description}
            </span>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
              See all industries
              <ArrowRight
                className="size-4 transition group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </a>
        </Reveal>
      </div>
    </section>
  );
}

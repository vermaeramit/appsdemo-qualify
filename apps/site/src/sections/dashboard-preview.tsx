import {
  BarChart3,
  FileText,
  Image as ImageIcon,
  MessagesSquare,
  Mic,
  Play,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { GradeBadge } from '../components/phone';
import { Reveal, SectionHeading } from '../components/section';
import { site } from '../config';

const ROWS = [
  {
    name: 'Priya Sharma',
    source: 'Meta form · 2BHK',
    grade: 'Hot',
    score: 86,
    note: 'Within 3 months, ₹85 L, site visit Sat',
  },
  {
    name: 'Rahul Mehta',
    source: 'CTWA ad · Bali',
    grade: 'Hot',
    score: 82,
    note: '2 adults, passports ready',
  },
  {
    name: 'Ananya Kapoor',
    source: 'Website · MBA',
    grade: 'Warm',
    score: 64,
    note: 'July intake, final year',
  },
  {
    name: 'Vikram Rao',
    source: 'Meta form · Clinic',
    grade: 'Hot',
    score: 79,
    note: 'Implant consult, Saturday',
  },
  {
    name: 'Meera Joshi',
    source: 'API · Interiors',
    grade: 'Warm',
    score: 58,
    note: 'Next month, partner decides',
  },
  {
    name: 'Karan Singh',
    source: 'Meta form · 3BHK',
    grade: 'Cold',
    score: 22,
    note: 'Just exploring',
  },
] as const;

const host = site.url ? site.url.replace(/^https?:\/\//, '') : 'your-dashboard';

/** A stylised dashboard: what the team sees, live. */
export function DashboardPreview() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div className="absolute inset-x-0 top-1/3 -z-10 h-96 bg-[radial-gradient(ellipse_at_center,oklch(0.9_0.06_277/0.6),transparent_70%)]" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Your dashboard"
          title="Every lead, every chat, every score. Live."
          body="Watch conversations as they happen, filter by grade or source, open a chat and take over with one click. New leads appear without refreshing."
        />

        <Reveal className="mt-14">
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_40px_100px_-30px_rgb(30_27_75/0.35)]">
            <div className="flex items-center gap-2 border-b border-line bg-zinc-50 px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-rose-400" />
                <span className="size-2.5 rounded-full bg-amber-400" />
                <span className="size-2.5 rounded-full bg-emerald-400" />
              </span>
              <span className="mx-auto max-w-xs flex-1 truncate rounded-md bg-white px-3 py-1 text-center text-xs text-ink-faint ring-1 ring-line">
                {host}/leads
              </span>
            </div>

            <div className="flex min-h-[420px]">
              <aside
                className="hidden w-14 shrink-0 flex-col items-center gap-4 border-r border-line bg-zinc-50/60 py-4 sm:flex"
                aria-hidden="true"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <BarChart3 className="size-4" />
                </span>
                {[Users, MessagesSquare, Settings].map((Icon, index) => (
                  <span
                    key={index}
                    className="flex size-8 items-center justify-center rounded-lg text-ink-faint"
                  >
                    <Icon className="size-4" />
                  </span>
                ))}
              </aside>

              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="mr-auto text-base font-semibold text-ink">Leads</h3>
                  <span className="hidden items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-faint sm:flex">
                    <Search className="size-3.5" aria-hidden="true" /> Search leads
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <span className="relative flex size-1.5">
                      <span className="animate-pulse-ring absolute inline-flex size-full rounded-full bg-emerald-500" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Live
                  </span>
                </div>
                <div className="mt-3 flex gap-1.5 text-xs">
                  {['All', 'Hot', 'Warm', 'Cold'].map((tab, index) => (
                    <span
                      key={tab}
                      className={`rounded-full px-2.5 py-1 font-medium ${index === 0 ? 'bg-ink text-white' : 'bg-zinc-100 text-ink-soft'}`}
                    >
                      {tab}
                    </span>
                  ))}
                </div>

                <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                  {ROWS.map((row, index) => (
                    <motion.li
                      key={row.name}
                      initial={{ opacity: 0, x: -12 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 + index * 0.08 }}
                      className={`flex items-center gap-3 px-3 py-2.5 ${index === 0 ? 'bg-indigo-50/50' : ''}`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-ink-soft">
                        {row.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {row.name}
                        </span>
                        <span className="block truncate text-xs text-ink-faint">
                          {row.source}
                          <span className="hidden md:inline"> · {row.note}</span>
                        </span>
                      </span>
                      <GradeBadge grade={row.grade} score={row.score} />
                    </motion.li>
                  ))}
                </ul>
              </div>

              <div className="hidden w-[320px] shrink-0 flex-col border-l border-line lg:flex">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                    PS
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">Priya Sharma</span>
                    <span className="block text-xs text-ink-faint">AI agent · Real estate</span>
                  </span>
                  <span className="rounded-full border border-line px-2.5 py-1 text-[0.7rem] font-medium text-ink-soft">
                    Pause AI
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-end gap-2 bg-zinc-50/60 p-3 text-[0.78rem]">
                  <span className="max-w-[85%] self-start rounded-xl rounded-bl-sm border border-line bg-white px-2.5 py-1.5 text-ink">
                    <span className="mb-1 flex h-20 items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 via-rose-100 to-indigo-100 text-ink-faint">
                      <ImageIcon className="size-5" aria-hidden="true" />
                    </span>
                    This is the floor plan I liked
                  </span>
                  <span className="flex max-w-[85%] items-center gap-2 self-start rounded-xl rounded-bl-sm border border-line bg-white px-2.5 py-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-indigo-600 text-white">
                      <Play className="size-3" aria-hidden="true" />
                    </span>
                    <span className="flex h-4 items-end gap-0.5" aria-hidden="true">
                      {[6, 10, 14, 8, 12, 16, 9, 13, 7, 11, 15, 8].map((height, index) => (
                        <span
                          key={index}
                          className="w-0.5 rounded-full bg-indigo-300"
                          style={{ height }}
                        />
                      ))}
                    </span>
                    <Mic className="size-3.5 text-ink-faint" aria-hidden="true" />
                    <span className="text-[0.65rem] text-ink-faint">0:12</span>
                  </span>
                  <span className="max-w-[85%] self-end rounded-xl rounded-br-sm bg-indigo-600 px-2.5 py-1.5 text-white">
                    Lovely choice! Shall we plan a site visit this Saturday?
                  </span>
                  <span className="flex max-w-[85%] items-center gap-2 self-start rounded-xl rounded-bl-sm border border-line bg-white px-2.5 py-1.5 text-ink">
                    <FileText className="size-4 text-rose-500" aria-hidden="true" />{' '}
                    Loan-sanction.pdf
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

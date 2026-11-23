import { Plus } from 'lucide-react';
import { WhatsAppIcon } from '../components/icons';
import { Logo } from '../components/logo';
import { Reveal, SectionHeading } from '../components/section';
import { appHref, demoHref, site } from '../config';
import { FAQ } from '../content';
import { INDUSTRY_PAGES } from '../industries';

export function Faq({
  items = FAQ,
  title = 'Questions, answered',
}: {
  items?: readonly { question: string; answer: string }[];
  title?: string;
}) {
  return (
    <section id="faq" className="border-t border-line bg-white py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="FAQ" title={title} />
        <div className="mx-auto mt-12 grid max-w-5xl gap-3 md:grid-cols-2">
          {items.map((item) => (
            <details
              key={item.question}
              className="faq group rounded-2xl border border-line bg-zinc-50/50 transition-colors open:bg-white open:shadow-sm"
            >
              <summary className="flex cursor-pointer items-start justify-between gap-4 p-5 text-left font-semibold text-ink">
                {item.question}
                <Plus
                  className="faq-icon mt-0.5 size-5 shrink-0 text-indigo-500 transition-transform duration-300"
                  aria-hidden="true"
                />
              </summary>
              <p className="-mt-1 px-5 pb-5 text-[0.95rem] leading-relaxed text-ink-soft">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ demoMessage }: { demoMessage?: string }) {
  return (
    <section className="px-4 py-20 sm:px-6 md:py-28">
      <Reveal>
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-[oklch(0.2_0.08_280)] px-6 py-16 text-center sm:px-12 md:py-20">
          <div className="bg-grid-dark absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="absolute -top-24 left-1/2 h-72 w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,oklch(0.6_0.22_277/0.55),transparent)]" />
          <div className="absolute -bottom-24 left-1/3 h-60 w-96 rounded-full bg-[radial-gradient(closest-side,oklch(0.7_0.18_150/0.35),transparent)]" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl leading-tight font-semibold tracking-[-0.03em] text-balance text-white sm:text-4xl md:text-5xl">
              Don’t take our word for it. Let our AI qualify you.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[1.05rem] leading-relaxed text-indigo-100/80">
              Send us a message on WhatsApp. Our own agent will reply in seconds and walk you
              through it, just like it would with your leads.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={demoHref(demoMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-wa px-7 py-4 text-base font-semibold text-[oklch(0.2_0.05_160)] shadow-[0_12px_40px_-10px_rgb(37_211_102/0.7)] transition hover:-translate-y-0.5 hover:bg-[#3be07a] sm:w-auto"
              >
                <WhatsAppIcon className="size-5" />
                Chat with us on WhatsApp
              </a>
              <a
                href={appHref('/signup')}
                className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-7 py-4 text-base font-semibold text-white transition hover:bg-white/10 sm:w-auto"
              >
                Create an account
              </a>
            </div>
            <p className="mt-4 text-sm text-indigo-200/70">Opens WhatsApp with a ready message.</p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const footerLinks = (demoMessage?: string) => [
  {
    title: 'Product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#features', label: 'Features' },
      { href: '/#industries', label: 'Industries' },
      { href: '/#faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Industries',
    links: INDUSTRY_PAGES.map((page) => ({ href: `/${page.slug}`, label: page.name })),
  },
  {
    title: 'Get started',
    links: [
      { href: demoHref(demoMessage), label: 'Live demo on WhatsApp', external: true },
      { href: appHref('/signup'), label: 'Create an account' },
      { href: appHref('/login'), label: 'Log in' },
    ],
  },
];

export function Footer({ demoMessage }: { demoMessage?: string }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
            AI lead qualification on WhatsApp. Every lead answered in seconds, scored, and sent to
            the right person.
          </p>
        </div>
        {footerLinks(demoMessage).map((group) => (
          <div key={group.title}>
            <p className="text-sm font-semibold text-ink">{group.title}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {group.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    {...('external' in link
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                    className="text-sm text-ink-soft transition hover:text-indigo-600"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-faint sm:px-6">
          © {__BUILD_YEAR__} {site.productName}. WhatsApp is a trademark of Meta Platforms, Inc.
        </p>
      </div>
    </footer>
  );
}

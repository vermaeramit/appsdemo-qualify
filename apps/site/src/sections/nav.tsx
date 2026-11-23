import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { WhatsAppIcon } from '../components/icons';
import { Logo } from '../components/logo';
import { appHref, demoHref } from '../config';

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#industries', label: 'Industries' },
  { href: '#faq', label: 'FAQ' },
];

/** A visitor who is signed in to the dashboard sees "Open dashboard" instead of "Log in". */
function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    // Same origin: the domain's /api in production, the dev server's /api proxy in development.
    fetch('/api/me', { credentials: 'same-origin', signal: controller.signal })
      .then((response) => setSignedIn(response.ok))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return signedIn;
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const signedIn = useSignedIn();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const account = signedIn
    ? { href: appHref('/dashboard'), label: 'Open dashboard' }
    : { href: appHref('/login'), label: 'Log in' };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? 'border-b border-line/80 bg-white/80 shadow-[0_1px_20px_rgb(30_27_75/0.06)] backdrop-blur-xl'
          : 'bg-transparent'
      }`}
    >
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"
        aria-label="Main"
      >
        <a href="#top" className="shrink-0" aria-label="Back to top">
          <Logo />
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition hover:bg-indigo-50 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href={account.href}
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink transition hover:bg-zinc-100"
          >
            {account.label}
          </a>
          <a
            href={demoHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            <WhatsAppIcon className="size-4" />
            Live demo
          </a>
        </div>

        <button
          type="button"
          className="-mr-2 inline-flex size-10 items-center justify-center rounded-full text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-line/80 md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-indigo-50"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a
                  href={account.href}
                  className="rounded-full border border-line px-4 py-3 text-center text-sm font-semibold text-ink"
                >
                  {account.label}
                </a>
                <a
                  href={demoHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-wa-deep px-4 py-3 text-sm font-semibold text-white"
                >
                  <WhatsAppIcon className="size-4" />
                  Live demo
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

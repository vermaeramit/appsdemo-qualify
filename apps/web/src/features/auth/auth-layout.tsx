import type { ReactNode } from 'react';
import { Gauge, MessageCircle, Webhook, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Split screen: brand story on the left (desktop), the form on the right. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 lg:justify-end">
          <div className="lg:hidden">
            <BrandLogo />
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <motion.div
            className="w-full max-w-sm space-y-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            {children}
            {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

const highlights: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageCircle,
    title: 'Replies in seconds, 24×7',
    text: 'Every Meta lead gets a WhatsApp message from your own number.',
  },
  {
    icon: Gauge,
    title: 'Scores every lead',
    text: 'Hot, Warm or Cold, with the reason behind each score.',
  },
  {
    icon: Webhook,
    title: 'Fits your workflow',
    text: 'Qualified leads go to your CRM by webhook, or to Excel.',
  },
];

function BrandPanel() {
  return (
    <aside
      className="relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between"
      style={{
        backgroundImage:
          'linear-gradient(135deg, var(--brand-gradient-from), var(--brand-gradient-to))',
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-24 -left-24 size-96 rounded-full bg-white/15 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-0 -bottom-32 size-[28rem] rounded-full bg-black/25 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.12)_1px,transparent_0)] bg-[size:22px_22px]" />
      </div>

      <div className="relative">
        <BrandLogo inverted />
      </div>

      <div className="relative space-y-8">
        <h2 className="max-w-md text-3xl leading-tight font-semibold tracking-tight">
          Qualify every lead in seconds, right on WhatsApp.
        </h2>
        <ul className="space-y-5">
          {highlights.map(({ icon: Icon, title, text }, index) => (
            <motion.li
              key={title}
              className="flex gap-3"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + index * 0.1 }}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/12 ring-1 ring-white/20">
                <Icon className="size-4.5" />
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-white/75">{text}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-white/60">
        © {new Date().getFullYear()} AppsDemo · AppsDemo Qualify
      </p>
    </aside>
  );
}

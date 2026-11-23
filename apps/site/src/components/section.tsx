import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Fades content up the first time it scrolls into view. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  dark = false,
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  dark?: boolean;
}) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p
        className={`text-sm font-semibold tracking-wide uppercase ${dark ? 'text-indigo-300' : 'text-indigo-600'}`}
      >
        {eyebrow}
      </p>
      <h2
        className={`mt-3 text-3xl leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-4xl md:text-[2.75rem] ${
          dark ? 'text-white' : 'text-ink'
        }`}
      >
        {title}
      </h2>
      {body && (
        <p
          className={`mt-4 text-[1.05rem] leading-relaxed text-pretty ${dark ? 'text-indigo-100/75' : 'text-ink-soft'}`}
        >
          {body}
        </p>
      )}
    </Reveal>
  );
}

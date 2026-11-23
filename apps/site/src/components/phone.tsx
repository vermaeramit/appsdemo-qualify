import { CheckCheck, ChevronLeft, Megaphone, Phone as PhoneIcon, Video } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { type Grade, GRADE_STYLES } from './grades';

/** A phone with a WhatsApp chat screen: the lead's view of the conversation. */
export function PhoneFrame({
  business,
  initials,
  status,
  children,
  className = '',
}: {
  business: string;
  initials: string;
  status: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[2.6rem] border-[10px] border-zinc-900 bg-zinc-900 shadow-[0_40px_80px_-20px_rgb(30_27_75/0.45)] ${className}`}
    >
      <div className="absolute top-2 left-1/2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-zinc-900" />
      <div className="flex h-full flex-col overflow-hidden rounded-[1.9rem]">
        <div className="flex items-center gap-2 bg-wa-deep px-3 pt-8 pb-2.5 text-white">
          <ChevronLeft className="size-5 shrink-0 opacity-90" aria-hidden="true" />
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-[0.7rem] font-semibold">
            {initials}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[0.8rem] font-semibold">{business}</span>
            <span className="block truncate text-[0.65rem] text-white/80">{status}</span>
          </span>
          <Video className="size-4 opacity-90" aria-hidden="true" />
          <PhoneIcon className="size-4 opacity-90" aria-hidden="true" />
        </div>
        <div className="bg-wa-wallpaper relative flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden px-2.5 pt-3 pb-3">
          {children}
        </div>
      </div>
    </div>
  );
}

const bubbleMotion = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 380, damping: 30 },
};

/** A message from the business (left, white) or the lead (right, green). */
export function Bubble({
  from,
  children,
  time = '10:42',
  note,
}: {
  from: 'business' | 'lead';
  children: ReactNode;
  time?: string;
  note?: string;
}) {
  const lead = from === 'lead';
  return (
    <motion.div
      layout="position"
      {...bubbleMotion}
      className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-[0.78rem] leading-snug text-zinc-900 shadow-[0_1px_0.5px_rgb(0_0_0/0.13)] ${
        lead ? 'self-end rounded-tr-sm bg-wa-out' : 'self-start rounded-tl-sm bg-white'
      }`}
    >
      {note && (
        <span className="mb-1 flex items-center gap-1.5 rounded-md bg-black/5 px-2 py-1 text-[0.65rem] text-zinc-600">
          <Megaphone className="size-3 shrink-0" aria-hidden="true" />
          {note}
        </span>
      )}
      <span>{children}</span>
      <span className="float-right mt-1.5 ml-2 flex items-center gap-0.5 text-[0.6rem] text-zinc-500">
        {time}
        {lead && <CheckCheck className="size-3 text-sky-500" aria-hidden="true" />}
      </span>
    </motion.div>
  );
}

/** WhatsApp reply buttons under a business message; `tapped` lights one up. */
export function ReplyButtons({ buttons, tapped }: { buttons: string[]; tapped?: string | null }) {
  return (
    <motion.div
      layout="position"
      {...bubbleMotion}
      className="flex max-w-[85%] flex-col gap-1 self-start"
    >
      {buttons.map((label) => (
        <span
          key={label}
          className={`rounded-xl px-3 py-1.5 text-center text-[0.75rem] font-medium shadow-[0_1px_0.5px_rgb(0_0_0/0.13)] transition-colors duration-300 ${
            tapped === label ? 'bg-wa-out text-wa-deep' : 'bg-white text-wa-link'
          }`}
        >
          {label}
        </span>
      ))}
    </motion.div>
  );
}

/** "typing…" dots. */
export function Typing() {
  return (
    <motion.div
      layout="position"
      {...bubbleMotion}
      className="flex items-center gap-1 self-start rounded-xl rounded-tl-sm bg-white px-3 py-2.5 shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]"
      aria-hidden="true"
    >
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="size-1.5 rounded-full bg-zinc-400"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }}
        />
      ))}
    </motion.div>
  );
}

export function GradeBadge({ grade, score }: { grade: Grade; score?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${GRADE_STYLES[grade].badge}`}
    >
      {grade}
      {score !== undefined && <span className="tabular-nums">· {score}</span>}
    </span>
  );
}

import { motion } from 'motion/react';
import type { LeadGrade } from '@qualify/shared';
import { AnimatedNumber } from '@/components/animated-number';
import { gradeStyles } from './grade';

const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;

/** Circular score gauge that fills to the lead's score in its grade colour. */
export function ScoreGauge({ score, grade }: { score: number; grade: LeadGrade }) {
  const style = gradeStyles[grade];
  const center = SIZE / 2;

  return (
    <div className="relative grid size-[132px] place-items-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={RADIUS}
          fill="none"
          stroke={style.colorVar}
          strokeWidth={STROKE}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: score / 100 }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div
        className="text-center"
        role="img"
        aria-label={`Score ${score} out of 100, ${style.label}`}
      >
        <div className="text-3xl font-semibold tracking-tight">
          <AnimatedNumber value={score} duration={1.3} />
        </div>
        <div className="text-xs font-medium" style={{ color: style.colorVar }}>
          {style.label}
        </div>
      </div>
    </div>
  );
}

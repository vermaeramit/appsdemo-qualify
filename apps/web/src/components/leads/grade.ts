import { Ban, Flame, Snowflake, ThermometerSun, type LucideIcon } from 'lucide-react';
import type { LeadGrade } from '@qualify/shared';

interface GradeStyle {
  label: string;
  icon: LucideIcon;
  /** CSS variable holding the grade colour (used by SVG strokes and inline styles). */
  colorVar: string;
  badgeClass: string;
}

export const gradeStyles: Record<LeadGrade, GradeStyle> = {
  hot: {
    label: 'Hot',
    icon: Flame,
    colorVar: 'var(--grade-hot)',
    badgeClass: 'bg-grade-hot/12 text-grade-hot ring-1 ring-grade-hot/25',
  },
  warm: {
    label: 'Warm',
    icon: ThermometerSun,
    colorVar: 'var(--grade-warm)',
    badgeClass: 'bg-grade-warm/14 text-grade-warm ring-1 ring-grade-warm/30',
  },
  cold: {
    label: 'Cold',
    icon: Snowflake,
    colorVar: 'var(--grade-cold)',
    badgeClass: 'bg-grade-cold/12 text-grade-cold ring-1 ring-grade-cold/25',
  },
  disqualified: {
    label: 'Not a fit',
    icon: Ban,
    colorVar: 'var(--grade-disqualified)',
    badgeClass: 'bg-muted text-muted-foreground ring-1 ring-border',
  },
};

/** How each grade looks on the website: badge colours and the score ring's colour. */
export const GRADE_STYLES = {
  Hot: { badge: 'bg-hot/10 text-hot ring-hot/25', ring: 'var(--color-hot)' },
  Warm: { badge: 'bg-warm/12 text-[oklch(0.55_0.14_65)] ring-warm/30', ring: 'var(--color-warm)' },
  Cold: { badge: 'bg-cold/10 text-cold ring-cold/25', ring: 'var(--color-cold)' },
} as const;

export type Grade = keyof typeof GRADE_STYLES;

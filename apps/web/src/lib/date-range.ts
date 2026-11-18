/** The viewer's time zone (sent to the API so "today" means the viewer's today). */
export const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Period presets for date filters. */
export const PERIOD_PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

/** Today and N-1 days back as YYYY-MM-DD, in the viewer's time zone. */
export function lastDays(days: number): { from: string; to: string } {
  const format = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: viewerTimeZone, dateStyle: 'short' }).format(date);
  const now = new Date();
  return { from: format(new Date(now.getTime() - (days - 1) * 86_400_000)), to: format(now) };
}

/** The preset matching a resolved range, if any. */
export function activePreset(range: { from: string; to: string } | undefined) {
  if (!range) return undefined;
  return PERIOD_PRESETS.find((preset) => {
    const candidate = lastDays(preset.days);
    return candidate.from === range.from && candidate.to === range.to;
  });
}

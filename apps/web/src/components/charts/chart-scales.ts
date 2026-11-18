/** Bucket keys are local times: "2026-11-18" or "2026-11-18T14". */
function bucketDate(bucket: string): Date {
  const [day = '', hour] = bucket.split('T');
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour ? Number(hour) : 0);
}

export function bucketLabel(bucket: string): string {
  const date = bucketDate(bucket);
  if (bucket.includes('T')) {
    const end = new Date(date.getTime() + 3_600_000);
    const time = (value: Date) => value.toLocaleTimeString([], { hour: 'numeric' });
    return `${time(date)}–${time(end)}`;
  }
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

export function axisLabel(bucket: string, index: number, count: number): string | null {
  const date = bucketDate(bucket);
  if (bucket.includes('T')) {
    return index % 6 === 0 ? date.toLocaleTimeString([], { hour: 'numeric' }) : null;
  }
  if (count <= 7) return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
  return (count - 1 - index) % 5 === 0
    ? date.toLocaleDateString([], { day: 'numeric', month: 'short' })
    : null;
}

/** Clean axis ticks: 1, 2, 5 × 10^n steps (whole numbers for counts). */
export function niceTicks(max: number, integer: boolean): number[] {
  if (integer && max <= 4) return Array.from({ length: Math.max(max, 1) + 1 }, (_, i) => i);
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10;
  const count = Math.ceil(max / step - 1e-9);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

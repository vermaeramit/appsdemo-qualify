/** Grade filter options for webhooks. */
export const GRADE_OPTIONS = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'disqualified', label: 'Not a fit' },
  { value: 'none', label: 'Not scored' },
] as const;

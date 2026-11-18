/** Lead statuses in pipeline order, with their labels and badge styles. */
export const LEAD_STATUSES: { status: string; label: string; className: string }[] = [
  { status: 'new', label: 'New', className: 'bg-muted text-muted-foreground' },
  { status: 'contacting', label: 'Contacted', className: 'bg-grade-cold/12 text-grade-cold' },
  { status: 'engaged', label: 'Qualifying', className: 'bg-primary/12 text-primary' },
  { status: 'qualified', label: 'Qualified', className: 'bg-success/14 text-success' },
  { status: 'handoff', label: 'Handed off', className: 'bg-grade-warm/16 text-grade-warm' },
  { status: 'disqualified', label: 'Not a fit', className: 'bg-muted text-muted-foreground' },
  { status: 'unresponsive', label: 'No reply', className: 'bg-muted text-muted-foreground' },
];

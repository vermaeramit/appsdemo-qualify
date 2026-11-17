import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-muted text-muted-foreground' },
  engaged: { label: 'Qualifying', className: 'bg-primary/12 text-primary' },
  qualified: { label: 'Qualified', className: 'bg-success/14 text-success' },
  handoff: { label: 'Handed off', className: 'bg-grade-warm/16 text-grade-warm' },
  disqualified: { label: 'Not a fit', className: 'bg-muted text-muted-foreground' },
  unresponsive: { label: 'No reply', className: 'bg-muted text-muted-foreground' },
};

export function LeadStatusBadge({ status }: { status: string }) {
  const style = STATUS[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <Badge variant="outline" className={cn('border-transparent', style.className)}>
      {style.label}
    </Badge>
  );
}

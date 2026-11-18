import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LEAD_STATUSES } from './lead-statuses';

export function LeadStatusBadge({ status }: { status: string }) {
  const style = LEAD_STATUSES.find((entry) => entry.status === status) ?? {
    label: status,
    className: 'bg-muted text-muted-foreground',
  };
  return (
    <Badge variant="outline" className={cn('border-transparent', style.className)}>
      {style.label}
    </Badge>
  );
}

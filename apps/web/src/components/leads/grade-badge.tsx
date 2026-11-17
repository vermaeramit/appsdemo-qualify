import type { LeadGrade } from '@qualify/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { gradeStyles } from './grade';

export function GradeBadge({ grade, className }: { grade: LeadGrade; className?: string }) {
  const style = gradeStyles[grade];
  const Icon = style.icon;
  return (
    <Badge variant="outline" className={cn('border-transparent', style.badgeClass, className)}>
      <Icon data-icon="inline-start" />
      {style.label}
    </Badge>
  );
}

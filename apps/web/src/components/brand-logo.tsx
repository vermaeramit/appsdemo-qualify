import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** `inverted` is for dark/brand backgrounds such as the sign-in panel. */
export function BrandLogo({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          'grid size-8 place-items-center rounded-lg shadow-sm',
          inverted
            ? 'bg-white text-[var(--brand-gradient-from)]'
            : 'bg-primary text-primary-foreground shadow-primary/30',
        )}
      >
        <Check className="size-4.5" strokeWidth={3} />
      </div>
      <div className="leading-none">
        <div
          className={cn(
            'text-[0.7rem] font-medium tracking-wide',
            inverted ? 'text-white/75' : 'text-muted-foreground',
          )}
        >
          AppsDemo
        </div>
        <div
          className={cn('text-[0.95rem] font-semibold tracking-tight', inverted && 'text-white')}
        >
          Qualify
        </div>
      </div>
    </div>
  );
}

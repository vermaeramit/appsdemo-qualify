import { Check } from 'lucide-react';

export function BrandLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <Check className="size-4.5" strokeWidth={3} />
      </div>
      <div className="leading-none">
        <div className="text-[0.7rem] font-medium tracking-wide text-muted-foreground">
          AppsDemo
        </div>
        <div className="text-[0.95rem] font-semibold tracking-tight">Qualify</div>
      </div>
    </div>
  );
}

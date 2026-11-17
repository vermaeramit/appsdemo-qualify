import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" className="h-10 w-full" disabled={pending} aria-busy={pending}>
      {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
      {children}
    </Button>
  );
}

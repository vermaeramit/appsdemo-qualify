import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Copies text and shows a tick for a moment. */
export function CopyButton({
  text,
  label,
  variant = 'outline',
  className,
}: {
  text: string;
  label: string;
  variant?: 'outline' | 'ghost';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size="icon"
      aria-label={label}
      className={cn(className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy. Select the text and copy it manually.');
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

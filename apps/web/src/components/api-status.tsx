import { useQuery } from '@tanstack/react-query';
import { healthResponseSchema } from '@qualify/shared';
import { cn } from '@/lib/utils';
import { fetchJson } from '@/lib/api';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Live API status pill: proves web → api → shared contract end to end. */
export function ApiStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJson('/api/health', healthResponseSchema),
    refetchInterval: 15_000,
    retry: false,
  });

  const state = health.isPending ? 'checking' : health.isSuccess ? 'online' : 'offline';
  const label = { checking: 'Checking API…', online: 'API online', offline: 'API offline' }[state];
  const detail = health.isSuccess
    ? `${health.data.service} v${health.data.version} · ${new Date(health.data.time).toLocaleTimeString()}`
    : health.isError
      ? 'Start it with: pnpm dev'
      : 'Contacting /api/health';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          className="flex h-7 items-center gap-2 rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground"
        >
          <span className="relative flex size-2">
            {state === 'online' && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            )}
            <span
              className={cn(
                'relative inline-flex size-2 rounded-full',
                state === 'online' && 'bg-success',
                state === 'offline' && 'bg-destructive',
                state === 'checking' && 'bg-muted-foreground/50',
              )}
            />
          </span>
          {label}
        </div>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

import { useState } from 'react';
import {
  type PlaybookConfig,
  playbookResponseSchema,
  playbookVersionListSchema,
} from '@qualify/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, fetchJson } from '@/lib/api';

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

/** Published versions; an old one can be loaded into the editor and published again (rollback). */
export function VersionHistory({
  canEdit,
  onLoad,
}: {
  canEdit: boolean;
  onLoad: (config: PlaybookConfig, versionNo: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const versions = useQuery({
    queryKey: ['playbook', 'versions'],
    queryFn: () => fetchJson('/api/playbook/versions', playbookVersionListSchema),
    enabled: open,
  });
  const load = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/playbook/versions/${id}`, playbookResponseSchema),
    onSuccess: (version) => {
      onLoad(version.config, version.versionNo);
      setOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not load that version.')),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <History data-icon="inline-start" />
          Versions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Every publish is kept. Load an older version into the editor, review it, and publish to
            go back to it. Running conversations keep the version they started with.
          </DialogDescription>
        </DialogHeader>
        {versions.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : versions.isError ? (
          <p className="text-sm text-destructive">Could not load versions.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {versions.data.versions.map((version) => (
              <li key={version.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    Version {version.versionNo}
                    {version.current && (
                      <Badge
                        variant="outline"
                        className="border-success/30 bg-success/10 text-success"
                      >
                        Live
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {when(version.publishedAt)}
                    {version.publishedBy && ` · ${version.publishedBy}`} · {version.questions}{' '}
                    {version.questions === 1 ? 'question' : 'questions'}
                  </div>
                </div>
                {canEdit && !version.current && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={load.isPending}
                    onClick={() => load.mutate(version.id)}
                  >
                    {load.isPending && load.variables === version.id && (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    )}
                    Load into editor
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

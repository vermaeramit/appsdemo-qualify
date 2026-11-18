import { adminOverviewSchema } from '@qualify/shared';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage, fetchJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';

const QUALITY: Record<string, string> = {
  GREEN: 'text-success',
  YELLOW: 'text-grade-warm',
  RED: 'text-destructive',
};

/** Platform operator view: every workspace's usage and number, and queue health. */
export function AdminPage() {
  const query = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => fetchJson('/api/admin/overview', adminOverviewSchema),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform admin</h1>
        <p className="text-sm text-muted-foreground">
          All workspaces (last 30 days) and background queues. Visible to platform admins only.
        </p>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(query.error, 'Could not load the overview.')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {query.data.queues.map((queue) => (
              <Card key={queue.name} className="gap-1 py-3">
                <CardHeader className="px-3">
                  <CardDescription className="truncate font-mono text-xs">
                    {queue.name}
                  </CardDescription>
                  <CardTitle className="text-xl tabular-nums">
                    {queue.waiting + queue.active}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 text-xs text-muted-foreground">
                  {queue.delayed} delayed ·{' '}
                  <span className={cn(queue.failed > 0 && 'font-medium text-destructive')}>
                    {queue.failed} failed
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Leads (30 d)</TableHead>
                  <TableHead className="text-right">Qualified (30 d)</TableHead>
                  <TableHead className="text-right">Messages (30 d)</TableHead>
                  <TableHead className="text-right">AI replies (30 d)</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead className="text-right">Webhooks</TableHead>
                  <TableHead>Last message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.workspaces.map((workspace) => (
                  <TableRow key={workspace.id}>
                    <TableCell>
                      <div className="font-medium">{workspace.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {workspace.slug} · {workspace.leadsTotal} leads in total
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{workspace.members}</TableCell>
                    <TableCell className="text-right tabular-nums">{workspace.leads30d}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {workspace.qualified30d}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {workspace.messages30d}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {workspace.aiReplies30d}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {workspace.phone ? (
                        <span>
                          {workspace.phone}{' '}
                          <span
                            className={cn(
                              'text-xs',
                              QUALITY[workspace.qualityRating ?? ''] ?? 'text-muted-foreground',
                            )}
                          >
                            {workspace.qualityRating?.toLowerCase() ?? ''}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not connected</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{workspace.webhooks}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {workspace.lastMessageAt ? timeAgo(workspace.lastMessageAt) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

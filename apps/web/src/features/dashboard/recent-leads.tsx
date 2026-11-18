import type { DashboardResponse } from '@qualify/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, MessageCircleDashed } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LeadStatusBadge } from '@/features/conversations/lead-status';
import { timeAgo } from '@/lib/time';
import { SOURCE_LABELS } from './queries';

const MotionTableRow = motion.create(TableRow);

/** Leads with activity in the period: who they are, what they answered, where they stand. */
export function RecentLeads({ data }: { data: DashboardResponse }) {
  const navigate = useNavigate();
  const leads = data.recentLeads;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent leads</CardTitle>
        <CardDescription>
          Latest activity in this period. Open one to read the chat.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/conversations" search={{}}>
              All conversations
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {leads.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-10 text-center">
            <MessageCircleDashed className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No lead activity in this period</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Leads appear here when someone messages your WhatsApp number, submits a form, or
              arrives through the API.
            </p>
            <Button variant="outline" size="sm" className="mt-1" asChild>
              <Link to="/conversations" search={{}}>
                Add a test lead
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Lead</TableHead>
                <TableHead className="hidden md:table-cell">Answers so far</TableHead>
                <TableHead>Required</TableHead>
                <TableHead className="pr-6 sm:pr-2">Status</TableHead>
                <TableHead className="hidden pr-6 text-right sm:table-cell">
                  Last activity
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead, index) => (
                <MotionTableRow
                  key={lead.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                  className="cursor-pointer"
                  onClick={() => void navigate({ to: '/conversations', search: { lead: lead.id } })}
                >
                  <TableCell className="pl-6">
                    <Link
                      to="/conversations"
                      search={{ lead: lead.id }}
                      className="block font-medium hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {lead.name ?? lead.phone}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {lead.name ? `${lead.phone} · ` : ''}
                      {SOURCE_LABELS[lead.source] ?? lead.source}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-64 md:table-cell">
                    {lead.highlights.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Nothing yet</span>
                    ) : (
                      <span className="block truncate text-xs text-muted-foreground">
                        {lead.highlights.map((item, i) => (
                          <span key={item.label}>
                            {i > 0 && ' · '}
                            <span className="text-foreground">{item.value}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RequiredProgress done={lead.requiredAnswered} total={lead.requiredTotal} />
                  </TableCell>
                  <TableCell className="pr-6 sm:pr-2">
                    <LeadStatusBadge status={lead.status} />
                  </TableCell>
                  <TableCell className="hidden pr-6 text-right text-xs text-muted-foreground sm:table-cell">
                    {timeAgo(lead.lastActivityAt)}
                  </TableCell>
                </MotionTableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RequiredProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-2" title={`${done} of ${total} required answers`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-primary/12">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </span>
      <span className="text-xs tabular-nums">
        {done}/{total}
      </span>
    </span>
  );
}

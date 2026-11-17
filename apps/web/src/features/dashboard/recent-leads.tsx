import { useEffect, useState } from 'react';
import { MessageCircle, RotateCcw, SquarePen } from 'lucide-react';
import { motion } from 'motion/react';
import { GradeBadge } from '@/components/leads/grade-badge';
import { gradeStyles } from '@/components/leads/grade';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { sampleLeads, type SampleLead } from './sample-data';

const MotionTableRow = motion.create(TableRow);

const SIMULATED_LOAD_MS = 1400;

export function RecentLeads() {
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState(0);

  // Simulates an API round-trip so the skeleton → content transition can be reviewed.
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), SIMULATED_LOAD_MS);
    return () => clearTimeout(timer);
  }, [run]);

  const replay = () => {
    setLoading(true);
    setRun((n) => n + 1);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent leads</CardTitle>
        <CardDescription>Scored by the AI agent in the last hour</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={replay} disabled={loading}>
            <RotateCcw data-icon="inline-start" />
            Replay loading
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Lead</TableHead>
              <TableHead className="hidden sm:table-cell">Source</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead className="hidden pr-4 text-right md:table-cell">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? sampleLeads.map((lead) => <SkeletonRow key={lead.id} />)
              : sampleLeads.map((lead, index) => (
                  <LeadRow key={`${run}-${lead.id}`} lead={lead} index={index} />
                ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LeadRow({ lead, index }: { lead: SampleLead; index: number }) {
  const SourceIcon = lead.source === 'Meta form' ? SquarePen : MessageCircle;
  return (
    <MotionTableRow
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
    >
      <TableCell className="pl-4">
        <div className="font-medium">{lead.name}</div>
        <div className="text-xs text-muted-foreground">{lead.trip}</div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <SourceIcon className="size-3.5" />
          {lead.source}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="w-6 text-right font-medium tabular-nums">{lead.score}</span>
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: gradeStyles[lead.grade].colorVar }}
              initial={{ width: 0 }}
              animate={{ width: `${lead.score}%` }}
              transition={{ duration: 0.8, delay: 0.15 + index * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <GradeBadge grade={lead.grade} />
      </TableCell>
      <TableCell className="hidden pr-4 text-right text-xs text-muted-foreground md:table-cell">
        {lead.receivedAgo}
      </TableCell>
    </MotionTableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="pl-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-1.5 h-3 w-36" />
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Skeleton className="h-3.5 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-3.5 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-14 rounded-full" />
      </TableCell>
      <TableCell className="hidden pr-4 md:table-cell">
        <Skeleton className="ml-auto h-3 w-16" />
      </TableCell>
    </TableRow>
  );
}

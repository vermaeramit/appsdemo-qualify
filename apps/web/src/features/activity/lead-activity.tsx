import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ActivityList } from './activity-list';
import { MetaSilentBanner } from './meta-health';

/** Conversation header → Activity: everything that happened to this lead, step by step (D-091). */
export function LeadActivityButton({ leadId, label }: { leadId: string; label: string }) {
  const [problems, setProblems] = useState(false);
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Activity">
          <ScrollText data-icon="inline-start" />
          <span className="hidden sm:inline">Activity</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Activity · {label}</SheetTitle>
          <SheetDescription>
            Every step for this lead: messages, AI replies, openings, follow-ups, webhooks and your
            team's actions. Tap an entry for details.
          </SheetDescription>
          <label className="flex items-center gap-2 pt-1 text-sm">
            <Switch checked={problems} onCheckedChange={setProblems} />
            Problems only
          </label>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <MetaSilentBanner />
          <ActivityList
            filters={{ leadId, problems }}
            emptyText={
              problems
                ? 'No problems for this lead.'
                : 'Nothing recorded yet. New steps show up here as they happen.'
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

import type { DashboardResponse } from '@qualify/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleCheck, CircleDashed, Clock, Phone, TriangleAlert, Unplug } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { openingTemplateQueryOptions } from '@/features/agent/queries';
import { cn } from '@/lib/utils';

const QUALITY: Record<string, { label: string; className: string }> = {
  GREEN: { label: 'High', className: 'text-success' },
  YELLOW: { label: 'Medium', className: 'text-grade-warm' },
  RED: { label: 'Low', className: 'text-destructive' },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5 text-right font-medium">{children}</span>
    </div>
  );
}

/** The connected number and whether form/API leads can be contacted outside 24 hours. */
export function WhatsAppHealth({ data }: { data: DashboardResponse }) {
  const template = useQuery({ ...openingTemplateQueryOptions, enabled: Boolean(data.whatsapp) });
  const number = data.whatsapp;
  const quality = number?.qualityRating ? QUALITY[number.qualityRating] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp</CardTitle>
        <CardDescription>Your connected number</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!number ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Unplug className="mt-0.5 size-4 shrink-0" />
            No WhatsApp number is connected to this workspace yet.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-success/10 text-success">
                <Phone className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{number.displayPhone}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {number.displayName ?? 'WhatsApp Business'} ·{' '}
                  {number.isCoexistence ? 'Coexistence' : 'Cloud API'}
                </span>
              </span>
            </div>
            <Row label="Quality rating">
              <span className={cn(quality?.className ?? 'text-muted-foreground')}>
                {quality?.label ?? 'Not reported yet'}
              </span>
            </Row>
            <Row label="Opening template">
              {template.isPending ? (
                <span className="text-muted-foreground">Checking…</span>
              ) : template.isError ? (
                <span className="text-muted-foreground">Could not check</span>
              ) : template.data.active ? (
                <>
                  <CircleCheck className="size-4 text-success" />
                  Active
                </>
              ) : template.data.state === 'pending' ? (
                <>
                  <Clock className="size-4 text-grade-cold" />
                  In review
                </>
              ) : template.data.state === 'rejected' || template.data.state === 'disabled' ? (
                <>
                  <TriangleAlert className="size-4 text-destructive" />
                  <Link to="/agent" className="hover:underline">
                    Needs a new text
                  </Link>
                </>
              ) : (
                <>
                  <CircleDashed className="size-4 text-muted-foreground" />
                  <Link to="/agent" className="hover:underline">
                    Not active
                  </Link>
                </>
              )}
            </Row>
          </>
        )}
      </CardContent>
    </Card>
  );
}

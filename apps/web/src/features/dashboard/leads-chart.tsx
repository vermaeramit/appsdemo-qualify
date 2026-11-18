import type { DashboardResponse } from '@qualify/shared';
import { bucketLabel } from '@/components/charts/chart-scales';
import { ColumnChart } from '@/components/charts/column-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** New leads per hour (today) or per day, covering the selected period. */
export function LeadsChart({ data }: { data: DashboardResponse }) {
  const hourly = data.bucket === 'hour';
  const total = data.series.reduce((sum, point) => sum + point.leads, 0);
  const qualified = new Map(data.series.map((point) => [point.bucket, point.qualified]));

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>New leads per {hourly ? 'hour' : 'day'}</CardTitle>
        <CardDescription>
          {total === 0
            ? 'No new leads in this period yet.'
            : `${total} ${total === 1 ? 'lead' : 'leads'} in this period. Hover a column for details.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ColumnChart
          integer
          points={data.series.map((point) => ({ bucket: point.bucket, value: point.leads }))}
          formatValue={(value) => String(value)}
          tooltip={(point) => (
            <>
              {point.value} {point.value === 1 ? 'lead' : 'leads'}
              <span className="font-normal opacity-80">
                {' '}
                · {qualified.get(point.bucket) ?? 0} qualified
              </span>
            </>
          )}
          ariaLabel={(point) =>
            `${bucketLabel(point.bucket)}: ${point.value} leads, ${qualified.get(point.bucket) ?? 0} qualified`
          }
          table={{ caption: `New leads per ${hourly ? 'hour' : 'day'}`, valueHeader: 'New leads' }}
        />
      </CardContent>
    </Card>
  );
}

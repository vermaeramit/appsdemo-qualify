import { MAX_FOLLOW_UPS } from '@qualify/shared';
import { Plus, X } from 'lucide-react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { type EditorConfig, friendlyError } from './form-helpers';
import { TemplateMessageEditor } from './opening-editor';

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: 'numeric' }),
}));

const TIME_ZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'UTC',
];

/** "27 h" or "3 days 3 h". */
function duration(hours: number): string {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  return rest ? `${days} days ${rest} h` : `${days} days`;
}

/** When and how often the agent follows up with leads who stop replying. */
export function FollowUpsEditor({ readOnly, dirty }: { readOnly: boolean; dirty: boolean }) {
  const { control, register, formState } = useFormContext<EditorConfig>();
  const { fields: steps, append, remove } = useFieldArray({ control, name: 'followUps.steps' });
  const settings = useWatch({ control, name: 'followUps' });
  const errors = formState.errors.followUps;
  const enabled = settings.enabled;
  const zones = TIME_ZONES.includes(settings.timezone)
    ? TIME_ZONES
    : [settings.timezone, ...TIME_ZONES];

  // Hours from our last unanswered message to each follow-up, then to "No reply".
  const cumulative = settings.steps.reduce<number[]>(
    (times, step) => [...times, (times.at(-1) ?? 0) + Number(step.afterHours || 0)],
    [],
  );
  const lastFollowUp = cumulative.at(-1) ?? 0;
  const noReplyAt = lastFollowUp + Number(settings.unresponsiveAfterHours || 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Follow-ups</CardTitle>
          <CardDescription>
            For leads who stop replying. Within 24 hours of the lead’s last message the AI writes a
            short reminder that asks the pending question again (free). After that WhatsApp only
            allows an approved template, which costs per message, so it is off unless you switch it
            on below.
          </CardDescription>
          <CardAction>
            <Controller
              control={control}
              name="followUps.enabled"
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Label htmlFor="followups-enabled" className="text-sm font-normal">
                    {field.value ? 'On' : 'Off'}
                  </Label>
                  <Switch
                    id="followups-enabled"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={readOnly}
                  />
                </div>
              )}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <fieldset
            disabled={readOnly || !enabled}
            className="min-w-0 space-y-5 disabled:opacity-60"
          >
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 font-medium">Follow-up {index + 1}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.5}
                    max={168}
                    step={0.5}
                    className="h-8 w-20"
                    aria-label={`Hours before follow-up ${index + 1}`}
                    aria-invalid={Boolean(errors?.steps?.[index]?.afterHours)}
                    {...register(`followUps.steps.${index}.afterHours`, { valueAsNumber: true })}
                  />
                  <span className="text-muted-foreground">
                    {index === 0
                      ? 'hours after our last message, if the lead hasn’t replied'
                      : `hours after follow-up ${index}`}
                  </span>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(index)}
                      aria-label={`Remove follow-up ${index + 1}`}
                    >
                      <X />
                    </Button>
                  )}
                  {errors?.steps?.[index]?.afterHours && (
                    <span className="w-full text-xs text-destructive">
                      Use 0.5 to 168 hours (up to 7 days)
                    </span>
                  )}
                </div>
              ))}
              {steps.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No reminders: the lead is marked “No reply” after the wait below.
                </p>
              )}
              {!readOnly && steps.length < MAX_FOLLOW_UPS && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ afterHours: 24 })}
                >
                  <Plus data-icon="inline-start" />
                  Add follow-up
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Mark as “No reply”</span>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                max={336}
                step={1}
                className="h-8 w-20"
                aria-label="Hours before marking No reply"
                aria-invalid={Boolean(errors?.unresponsiveAfterHours)}
                {...register('followUps.unresponsiveAfterHours', { valueAsNumber: true })}
              />
              <span className="text-muted-foreground">
                hours after the {steps.length ? 'last follow-up' : 'last message'}
              </span>
              {errors?.unresponsiveAfterHours && (
                <span className="w-full text-xs text-destructive">
                  {friendlyError(errors.unresponsiveAfterHours.message) ?? 'Use 1 to 336 hours'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Quiet hours</span>
              <span className="text-muted-foreground">no messages from</span>
              <Controller
                control={control}
                name="followUps.quietHours.start"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                    disabled={readOnly || !enabled}
                  >
                    <SelectTrigger className="h-8 w-28" aria-label="Quiet hours start">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour.value} value={hour.value}>
                          {hour.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <span className="text-muted-foreground">to</span>
              <Controller
                control={control}
                name="followUps.quietHours.end"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                    disabled={readOnly || !enabled}
                  >
                    <SelectTrigger className="h-8 w-28" aria-label="Quiet hours end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour.value} value={hour.value}>
                          {hour.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Controller
                control={control}
                name="followUps.timezone"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={readOnly || !enabled}
                  >
                    <SelectTrigger className="h-8 w-44" aria-label="Time zone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((zone) => (
                        <SelectItem key={zone} value={zone}>
                          {zone.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <Controller
              control={control}
              name="followUps.templateOutsideWindow"
              render={({ field }) => (
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Switch
                    id="followups-paid"
                    checked={field.value === true}
                    onCheckedChange={field.onChange}
                  />
                  <Label htmlFor="followups-paid" className="block font-normal">
                    <span className="block text-sm font-medium">
                      Also follow up after the free 24-hour window (paid)
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Off: follow-ups go only while the lead’s last message is less than 24 hours
                      old, so a lead who never replied gets none. On: after that, the approved
                      template below is sent (Meta charges per message).
                    </span>
                  </Label>
                </div>
              )}
            />

            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {steps.length
                ? `Timeline after our last unanswered message: follow-ups at ${cumulative
                    .map(duration)
                    .join(', ')}; “No reply” at ${duration(noReplyAt)}. `
                : `The lead becomes “No reply” ${duration(noReplyAt)} after our last unanswered message. `}
              A follow-up due in quiet hours waits until they end. Any reply from the lead stops the
              sequence.
            </p>
          </fieldset>
        </CardContent>
      </Card>

      {settings.templateOutsideWindow === true && (
        <TemplateMessageEditor
          base="followUps.template"
          kind="followup"
          title="Follow-up template"
          description="Sent when the lead hasn’t written in the last 24 hours (WhatsApp only allows an approved template then). Variables like {{1}} are filled for each lead."
          readOnly={readOnly}
          dirty={dirty}
        />
      )}
    </div>
  );
}

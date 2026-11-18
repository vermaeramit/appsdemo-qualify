import { useState } from 'react';
import { leadDeletionSchema } from '@qualify/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';

const CONFIRM_WORD = 'DELETE';

/** Deletes a lead with its conversation and everything linked to it (owners, managers). */
export function DeleteLeadButton({ leadId, label }: { leadId: string; label: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const remove = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Could not delete the lead');
      }
      return leadDeletionSchema.parse(await response.json());
    },
    onSuccess: async (deleted) => {
      setOpen(false);
      toast.success(`Deleted ${label}`, {
        description: `${deleted.messages} messages, ${deleted.formSubmissions} form submissions and ${deleted.webhookDeliveries} webhook deliveries removed.`,
      });
      queryClient.removeQueries({ queryKey: ['conversations', leadId] });
      await navigate({ to: '/conversations', search: {} });
      await Promise.all(
        [['conversations'], ['leads'], ['dashboard'], ['meta-leads']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTyped('');
          remove.reset();
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive" aria-label="Delete lead">
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>This permanently deletes, and can&apos;t be undone:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>the lead, its answers, score and summary</li>
                <li>the whole conversation (every message)</li>
                <li>its Meta lead form submissions</li>
                <li>the webhook deliveries that carried its details</li>
              </ul>
              <p>
                The activity log keeps that the lead was deleted, without its details. Messages
                already on the lead&apos;s phone stay there. If the lead writes again, a new lead
                starts.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="confirm-delete" className="text-sm">
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </label>
          <Input
            id="confirm-delete"
            autoComplete="off"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          {remove.isError && (
            <p className="text-sm text-destructive">
              {errorMessage(remove.error, 'Could not delete the lead.')}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={typed.trim().toUpperCase() !== CONFIRM_WORD || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

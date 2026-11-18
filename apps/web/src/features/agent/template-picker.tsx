import { useState } from 'react';
import { PLAYBOOK_TEMPLATES, type PlaybookTemplate } from '@qualify/core';
import { LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Starts the editor from an industry template. Nothing changes for leads until the owner
 * reviews and publishes.
 */
export function TemplatePicker({ onPick }: { onPick: (template: PlaybookTemplate) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <LayoutTemplate data-icon="inline-start" />
          Use a template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Replaces the questions, wording, follow-ups and scoring in the editor with a ready-made
            setup for your kind of business. Review it, then publish to use it.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {PLAYBOOK_TEMPLATES.map((template) => (
            <li key={template.key}>
              <button
                type="button"
                className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
                onClick={() => {
                  onPick(template);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium">{template.name}</span>
                <span className="block text-xs text-muted-foreground">{template.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

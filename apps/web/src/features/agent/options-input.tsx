import { useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MAX_OPTIONS = 10;
const MAX_LENGTH = 24;

interface OptionsInputProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}

/** Answer options as removable chips. Type one and press Enter (or Add). */
export function OptionsInput({ id, value, onChange, disabled, invalid }: OptionsInputProps) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const duplicate = value.some((option) => option.toLowerCase() === trimmed.toLowerCase());
  const full = value.length >= MAX_OPTIONS;
  const canAdd = trimmed.length > 0 && !duplicate && !full && !disabled;

  const add = () => {
    if (!canAdd) return;
    onChange([...value, trimmed.slice(0, MAX_LENGTH)]);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Options">
          <AnimatePresence initial={false}>
            {value.map((option, index) => (
              <motion.li
                key={option}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border bg-secondary py-1 pr-1 pl-3 text-sm',
                  option.length > 20 && 'border-grade-warm/50',
                )}
                title={option.length > 20 ? 'Over 20 characters: shown as a list menu' : undefined}
              >
                {option}
                {!disabled && (
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    aria-label={`Remove ${option}`}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={draft}
            maxLength={MAX_LENGTH}
            placeholder={full ? 'Maximum 10 options' : 'Type an option and press Enter'}
            disabled={full}
            aria-invalid={invalid}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <Button type="button" variant="outline" onClick={add} disabled={!canAdd}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        </div>
      )}
      {duplicate && trimmed && (
        <p className="text-xs text-muted-foreground">This option is already in the list.</p>
      )}
    </div>
  );
}

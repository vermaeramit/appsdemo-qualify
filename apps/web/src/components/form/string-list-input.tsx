import { Plus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface StringListInputProps {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  addLabel: string;
  max: number;
  maxLength: number;
  disabled?: boolean;
  /** Error per item (same index). */
  itemErrors?: (string | undefined)[];
}

/** An editable list of short texts (rules, handoff triggers…). */
export function StringListInput(props: StringListInputProps) {
  const { id, value, onChange, disabled } = props;
  const update = (index: number, text: string) =>
    onChange(value.map((item, i) => (i === index ? text : item)));

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {value.map((item, index) => (
            <motion.li
              // Items have no stable id; index keys are fine because rows are only appended or removed.
              key={index}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex gap-2">
                <Input
                  id={index === 0 ? id : `${id}-${index}`}
                  value={item}
                  maxLength={props.maxLength}
                  placeholder={props.placeholder}
                  disabled={disabled}
                  aria-invalid={Boolean(props.itemErrors?.[index])}
                  aria-label={`${props.addLabel.replace(/^Add /, '')} ${index + 1}`}
                  onChange={(event) => update(index, event.target.value)}
                />
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    aria-label={`Remove item ${index + 1}`}
                  >
                    <X />
                  </Button>
                )}
              </div>
              {props.itemErrors?.[index] && (
                <p className="mt-1 text-xs font-medium text-destructive">
                  {props.itemErrors[index]}
                </p>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {!disabled && value.length < props.max && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, ''])}>
          <Plus data-icon="inline-start" />
          {props.addLabel}
        </Button>
      )}
    </div>
  );
}

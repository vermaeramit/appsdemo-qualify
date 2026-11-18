import { CopyButton } from '@/components/copy-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/** Monospace code with a copy button. */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('group relative rounded-lg border bg-muted/50', className)}>
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton
        text={code}
        label={`Copy ${label}`}
        variant="ghost"
        className="absolute top-1.5 right-1.5 size-7"
      />
    </div>
  );
}

/** The same request in several languages. */
export function CodeTabs({
  examples,
}: {
  examples: { id: string; label: string; code: string }[];
}) {
  return (
    <Tabs defaultValue={examples[0]?.id}>
      <TabsList>
        {examples.map((example) => (
          <TabsTrigger key={example.id} value={example.id}>
            {example.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {examples.map((example) => (
        <TabsContent key={example.id} value={example.id} className="mt-2">
          <CodeBlock code={example.code} label={`${example.label} example`} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleCheck, CircleDashed, Download, KeyRound } from 'lucide-react';
import { CopyButton } from '@/components/copy-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { openingTemplateQueryOptions, playbookQueryOptions } from '@/features/agent/queries';
import { cn } from '@/lib/utils';
import { CodeBlock, CodeTabs } from './code-block';
import {
  acceptedValues,
  curlExample,
  downloadJson,
  exampleLead,
  fetchExample,
  postmanCollection,
} from './examples';

const SECTIONS = [
  { id: 'quick-start', label: 'Quick start' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'create-lead', label: 'Create a lead' },
  { id: 'questions', label: 'Your question keys' },
  { id: 'what-happens', label: 'What happens next' },
  { id: 'outcome', label: 'Report the outcome' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'playbook', label: 'Agent configuration' },
  { id: 'errors', label: 'Errors and limits' },
] as const;

const METHOD_STYLE: Record<string, string> = {
  GET: 'bg-success/12 text-success',
  POST: 'bg-primary/12 text-primary',
  PUT: 'bg-grade-warm/14 text-grade-warm',
};

function Method({ method }: { method: string }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold',
        METHOD_STYLE[method],
      )}
    >
      {method}
    </span>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3 border-b pb-8 last:border-b-0">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Endpoint({ method, path, summary }: { method: string; path: string; summary: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
      <Method method={method} />
      <code className="font-mono text-sm">{path}</code>
      <span className="text-xs text-muted-foreground sm:ml-auto">{summary}</span>
    </div>
  );
}

function Rules({
  rows,
  headers = ['Field', 'Required', 'Rules'],
}: {
  rows: [string, string, string][];
  headers?: [string, string, string];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">{headers[0]}</TableHead>
            <TableHead className="w-28">{headers[1]}</TableHead>
            <TableHead>{headers[2]}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([field, required, rules]) => (
            <TableRow key={field}>
              <TableCell className="font-mono text-xs">{field}</TableCell>
              <TableCell className="text-xs">{required}</TableCell>
              <TableCell className="text-xs whitespace-normal">{rules}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const P = ({ children }: { children: ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
);

/** Public API reference, filled with this workspace's base URL and question keys. */
export function ApiDocsPage() {
  const playbook = useQuery(playbookQueryOptions);
  const template = useQuery(openingTemplateQueryOptions);
  const baseUrl = `${window.location.origin}/api`;
  const config = playbook.data?.config;
  const body = exampleLead(config);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_200px]">
      <div className="min-w-0 space-y-8">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">API docs</h1>
            <p className="text-sm text-muted-foreground">
              Send leads from your website, CRM or Postman. The agent contacts them on WhatsApp.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex w-full max-w-md gap-2">
              <Input readOnly value={baseUrl} className="font-mono text-xs" aria-label="Base URL" />
              <CopyButton text={baseUrl} label="Copy base URL" />
            </div>
            <Button
              variant="outline"
              disabled={playbook.isPending}
              onClick={() =>
                downloadJson(
                  'AppsDemo-Qualify.postman_collection.json',
                  postmanCollection(baseUrl, config),
                )
              }
            >
              <Download data-icon="inline-start" />
              Postman collection
            </Button>
          </div>
        </div>

        <Section id="quick-start" title="Quick start">
          <ol className="space-y-2 text-sm">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                1
              </span>
              <span>
                Create an API key in{' '}
                <Link to="/settings" className="font-medium text-primary hover:underline">
                  Settings → API keys
                </Link>
                . It is shown once.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                2
              </span>
              <span>Send a lead with the request below (or import the Postman collection).</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                3
              </span>
              <span>
                Watch the opening message and the chat in{' '}
                <Link to="/conversations" className="font-medium text-primary hover:underline">
                  Conversations
                </Link>
                .
              </span>
            </li>
          </ol>
        </Section>

        <Section id="authentication" title="Authentication">
          <P>Every request carries a workspace API key, in either header:</P>
          <CodeBlock
            label="authentication headers"
            code={'Authorization: Bearer qk_live_…\n# or\nX-API-Key: qk_live_…'}
          />
          <P>
            Keep keys on your server, never in a web page. A revoked key stops working at once
            (401).
          </P>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings">
              <KeyRound data-icon="inline-start" />
              Manage API keys
            </Link>
          </Button>
        </Section>

        <Section id="create-lead" title="Create a lead">
          <Endpoint method="POST" path="/v1/leads" summary="Returns 202 and queues the opening" />
          <P>
            Use it for website forms, CRMs and Meta lead forms. The same phone number is the same
            lead: a repeat submission updates it and merges the answers.
          </P>
          <CodeTabs
            examples={[
              { id: 'curl', label: 'cURL', code: curlExample(baseUrl, body) },
              { id: 'js', label: 'JavaScript', code: fetchExample(baseUrl, body) },
              { id: 'json', label: 'JSON body', code: JSON.stringify(body, null, 2) },
            ]}
          />
          <Rules
            rows={[
              [
                'phone',
                'Yes',
                'WhatsApp number with country code, 10–15 digits. Digits, spaces, +, - and () are allowed.',
              ],
              ['name', 'No', 'Used in the opening message ("Hi Rahul!").'],
              ['source', 'No', '"api" (default) or "meta_form".'],
              ['campaign', 'No', 'Free text, kept in the audit log.'],
              [
                'fields',
                'No',
                'Answers the lead already gave, keyed by your question keys (below). The agent never asks them again. Unknown keys and values that don’t fit are ignored and listed in ignoredFields.',
              ],
            ]}
          />
          <p className="text-sm font-medium">Response · 202 Accepted</p>
          <CodeBlock
            label="response"
            code={JSON.stringify(
              {
                leadId: '3f0c…',
                isNewLead: true,
                status: 'queued',
                ignoredFields: [],
              },
              null,
              2,
            )}
          />
        </Section>

        <Section id="questions" title="Your question keys">
          <P>
            The keys you can send in <code className="font-mono text-xs">fields</code>, from your
            current agent configuration
            {playbook.data ? ` (v${playbook.data.versionNo})` : ''}. Change them on the{' '}
            <Link to="/agent" className="font-medium text-primary hover:underline">
              AI agent
            </Link>{' '}
            page.
          </P>
          {playbook.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : !config ? (
            <p className="text-sm text-destructive">Could not load your questions.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Accepted values</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.fields.map((field) => (
                    <TableRow key={field.key}>
                      <TableCell className="font-mono text-xs">{field.key}</TableCell>
                      <TableCell className="text-xs">
                        {field.label}
                        {field.required && (
                          <Badge variant="outline" className="ml-1.5 text-[0.6rem]">
                            Required
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-normal text-muted-foreground">
                        {acceptedValues(field)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        <Section id="what-happens" title="What happens next">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Within seconds the agent sends the <span className="text-foreground">opening</span>{' '}
              from your WhatsApp number. If the lead messaged you in the last 24 hours it goes as
              normal text with buttons; otherwise WhatsApp only allows your approved template.
            </li>
            <li>
              When the lead replies, the agent first checks the answers you sent with the lead (you
              can turn this off on the AI agent page), then asks only what is still missing.
            </li>
            <li>
              A second submission for the same lead within 10 minutes doesn’t send another opening.
            </li>
          </ol>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
            {template.data?.active ? (
              <CircleCheck className="size-4 text-success" />
            ) : (
              <CircleDashed className="size-4 text-muted-foreground" />
            )}
            <span>
              Opening template:{' '}
              {template.isPending
                ? 'checking…'
                : template.data?.active
                  ? 'approved and active'
                  : 'not active yet'}
            </span>
            {template.data && (
              <code className="font-mono text-[0.7rem] text-muted-foreground">
                {template.data.name}
              </code>
            )}
            <Link
              to="/agent"
              className="text-xs font-medium text-primary hover:underline sm:ml-auto"
            >
              Manage
            </Link>
          </div>
          {import.meta.env.DEV && (
            <P>
              Development: the worker’s DEV_ALLOWED_NUMBERS setting decides who receives WhatsApp
              messages (“*” = every lead).
            </P>
          )}
        </Section>

        <Section id="outcome" title="Report the outcome">
          <Endpoint
            method="POST"
            path="/v1/leads/{leadId}/outcome"
            summary="What happened after the hand-off"
          />
          <P>
            Send{' '}
            <code className="font-mono text-xs">
              {
                '{ "outcome": "won" | "lost" | "in_progress" | "no_answer", "value"?: 50000, "currency"?: "INR", "note"?: "…" }'
              }
            </code>
            . The outcome shows on the lead and in the Excel export, and helps tune scoring later.
            The lead id comes from the create response or a webhook.
          </P>
        </Section>

        <Section id="webhooks" title="Webhooks">
          <P>
            Get leads pushed to your system as they happen: add an endpoint on the Integrations page
            and pick the events (new lead, qualified, handed off, not a fit, no reply, not
            reachable). Each POST carries the lead with its answers, score, reason, summary and
            source, and is signed with{' '}
            <code className="font-mono text-xs">X-Qualify-Signature: t=…,v1=…</code> (HMAC-SHA256 of{' '}
            <code className="font-mono text-xs">{'"<t>.<raw body>"'}</code>). Reply with a 2xx
            within 10 seconds; failures are retried for about 2 hours, and the event{' '}
            <code className="font-mono text-xs">id</code> stays the same so you can ignore
            duplicates.
          </P>
        </Section>

        <Section id="playbook" title="Agent configuration">
          <Endpoint method="GET" path="/v1/playbook" summary="Current published configuration" />
          <Endpoint method="PUT" path="/v1/playbook" summary="Publish a new version" />
          <P>
            GET returns{' '}
            <code className="font-mono text-xs">
              {'{ playbookId, versionId, versionNo, config }'}
            </code>
            . PUT takes the full <code className="font-mono text-xs">config</code> and publishes a
            new version; running conversations keep theirs. The same settings are on the AI agent
            page.
          </P>
          <P>Question types in config.fields:</P>
          <Rules
            headers={['type', 'Needs', 'How the lead answers']}
            rows={[
              [
                'choice',
                'options: 2–10',
                '≤3 options of ≤20 characters → reply buttons; otherwise a list menu. allowOther: true accepts other typed answers.',
              ],
              ['yes_no', '—', 'Yes / No buttons in the lead’s language.'],
              [
                'text, number, range, date_month',
                '—',
                'Plain questions: the lead types the answer.',
              ],
            ]}
          />
        </Section>

        <Section id="errors" title="Errors and limits">
          <Rules
            headers={['Status', '', 'Meaning']}
            rows={[
              ['400', '', 'Invalid body. issues lists each problem with its path.'],
              ['401', '', 'Missing, invalid or revoked API key.'],
              ['429', '', 'More than 300 requests a minute from one IP.'],
            ]}
          />
          <CodeBlock
            label="error example"
            code={JSON.stringify(
              {
                message: 'Invalid request body',
                issues: [
                  {
                    path: 'phone',
                    message:
                      'Use a full number with country code (10–15 digits), e.g. +919812345678',
                  },
                ],
              },
              null,
              2,
            )}
          />
        </Section>
      </div>

      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-20 space-y-1 text-sm">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            On this page
          </p>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="block rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

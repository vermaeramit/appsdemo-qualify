import { createFileRoute } from '@tanstack/react-router';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiKeysCard, CopyButton } from '@/features/settings/api-keys-card';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { canManage } from '@/lib/workspace';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
});

const ENDPOINTS = [
  { method: 'POST', path: '/v1/leads', what: 'Add a lead (the agent sends the opening)' },
  { method: 'GET', path: '/v1/playbook', what: 'Read the agent configuration' },
  { method: 'PUT', path: '/v1/playbook', what: 'Publish a new agent configuration' },
];

function SettingsPage() {
  const workspace = useActiveWorkspace();
  const baseUrl = `${window.location.origin}/api`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace: {workspace.name}</p>
      </div>

      {canManage(workspace.role) ? (
        <ApiKeysCard />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="size-5" />
            Only owners and managers can see and create API keys.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Public API</CardTitle>
          <CardDescription>
            Base URL for your requests. A Postman collection is in the repository under docs/api.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-xl gap-2">
            <Input readOnly value={baseUrl} className="font-mono text-xs" aria-label="Base URL" />
            <CopyButton text={baseUrl} label="Copy base URL" />
          </div>
          <ul className="divide-y rounded-lg border text-sm">
            {ENDPOINTS.map((endpoint) => (
              <li
                key={`${endpoint.method} ${endpoint.path}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
              >
                <span className="w-10 font-mono text-xs font-semibold text-primary">
                  {endpoint.method}
                </span>
                <span className="font-mono text-xs">{endpoint.path}</span>
                <span className="text-xs text-muted-foreground sm:ml-auto">{endpoint.what}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

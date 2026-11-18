import { createFileRoute } from '@tanstack/react-router';
import { IntegrationsPage } from '@/features/integrations/integrations-page';

export const Route = createFileRoute('/_app/integrations')({
  component: IntegrationsPage,
});

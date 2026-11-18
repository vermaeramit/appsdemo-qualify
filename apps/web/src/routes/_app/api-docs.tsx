import { createFileRoute } from '@tanstack/react-router';
import { ApiDocsPage } from '@/features/api-docs/api-docs-page';

export const Route = createFileRoute('/_app/api-docs')({
  component: ApiDocsPage,
});

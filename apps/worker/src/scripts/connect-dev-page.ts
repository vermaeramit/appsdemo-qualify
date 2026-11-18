// Connects a Facebook Page's lead forms to a workspace (development; Embedded Signup comes in M6).
//   pnpm --filter @qualify/worker connect-dev-page [workspace-slug] [page-id-or-name]
// Needs a system-user token (WHATSAPP_SYSTEM_USER_TOKEN, or META_PAGES_TOKEN if set) with
// pages_show_list, pages_read_engagement, pages_manage_metadata and leads_retrieval, and the
// Page assigned to that system user. Stores the Page token encrypted and subscribes our app to
// the Page's leadgen webhook. Never prints tokens.
import '../load-env.ts';
import { createDb, facebookPages, organization, withTenant } from '@qualify/db';
import { encryptSecret, MetaApiError, parseMasterKey, WhatsAppClient } from '@qualify/integrations';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✗ ${name} is not set in .env`);
    process.exit(1);
  }
  return value;
}

const token = process.env.META_PAGES_TOKEN?.trim() || required('WHATSAPP_SYSTEM_USER_TOKEN');
const masterKey = parseMasterKey(required('ENCRYPTION_MASTER_KEY'));
const graphVersion = process.env.META_GRAPH_VERSION?.trim();
const client = (accessToken: string) =>
  new WhatsAppClient({ accessToken, ...(graphVersion ? { graphVersion } : {}) });
const { db, pool } = createDb(required('APP_DATABASE_URL'), { max: 1 });

try {
  const [slug, pageArg] = process.argv.slice(2);
  const workspaces = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization);
  const workspace = slug
    ? workspaces.find((candidate) => candidate.slug === slug)
    : workspaces.length === 1
      ? workspaces[0]
      : undefined;
  if (!workspace) {
    console.error(
      `✗ Pass the workspace slug. Available: ${workspaces.map((w) => w.slug).join(', ')}`,
    );
    process.exit(1);
  }

  const pages = (await client(token).listPages()).data;
  if (pages.length === 0) {
    console.error(
      '✗ The token sees no Pages. Assign the Page to the system user (Business Settings → System users → Assign assets) and generate a token with pages_show_list, pages_read_engagement, pages_manage_metadata and leads_retrieval.',
    );
    process.exit(1);
  }
  const page = pageArg
    ? pages.find((candidate) => candidate.id === pageArg || candidate.name === pageArg)
    : pages.length === 1
      ? pages[0]
      : undefined;
  if (!page) {
    console.error(
      `✗ Pass the Page id or name. Available: ${pages.map((p) => `${p.name} (${p.id})`).join(', ')}`,
    );
    process.exit(1);
  }
  if (!page.access_token) {
    console.error('✗ No Page token returned: the token needs pages_show_list and Page access.');
    process.exit(1);
  }

  const pageClient = client(page.access_token);
  await pageClient.subscribeAppToPage(page.id);
  await withTenant(db, workspace.id, (tx) =>
    tx
      .insert(facebookPages)
      .values({
        tenantId: workspace.id,
        pageId: page.id,
        name: page.name,
        accessTokenEnc: encryptSecret(page.access_token!, masterKey),
      })
      .onConflictDoUpdate({
        target: facebookPages.pageId,
        set: {
          name: page.name,
          accessTokenEnc: encryptSecret(page.access_token!, masterKey),
          status: 'active',
        },
      }),
  );
  console.log(
    `✓ "${page.name}" (${page.id}) connected to "${workspace.name}" and subscribed to leadgen`,
  );

  const forms = await pageClient.listLeadForms(page.id).catch((error: unknown) => {
    console.warn(
      `• Could not list forms: ${error instanceof MetaApiError ? error.message : error}`,
    );
    return { data: [] };
  });
  for (const form of forms.data)
    console.log(`  • form "${form.name}" (${form.id}) — ${form.status}`);
  console.log(
    'Test with the Lead Ads Testing Tool: https://developers.facebook.com/tools/lead-ads-testing',
  );
} catch (error) {
  console.error('✗ Failed:', error instanceof MetaApiError ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

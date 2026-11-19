// Shared Testcontainers setup for worker integration tests: real Postgres, real migrations,
// app connection as qualify_app (RLS enforced), one seeded tenant with a WhatsApp number.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { travelPlaybookTemplate, TRAVEL_TEMPLATE_KEY } from '@qualify/core';
import {
  createDb,
  createPublishedPlaybook,
  type Database,
  type DbHandle,
  listActivity,
  organization,
  phoneNumbers,
  runMigrations,
  tenants,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import { encryptSecret } from '@qualify/integrations';
import pg from 'pg';

export const TENANT = 'org_travel';
export const PHONE_NUMBER_ID = 'PN_DEV';
export const ALLOWED = '919812345678';
export const STRANGER = '919800000099';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  app: DbHandle;
  playbookVersionId: string;
  stop: () => Promise<void>;
}

export async function startTestDb(masterKey: Buffer): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const ownerUrl = container.getConnectionUri();
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`CREATE ROLE qualify_app LOGIN PASSWORD 'app_pw'`);
  await owner.end();
  await runMigrations(ownerUrl);

  const seed = createDb(ownerUrl, { max: 1 });
  await seed.db
    .insert(organization)
    .values({ id: TENANT, name: 'Sunrise Holidays', slug: 'sunrise', createdAt: new Date() });
  await seed.db.insert(tenants).values({ id: TENANT });
  const [account] = await seed.db
    .insert(whatsappAccounts)
    .values({
      tenantId: TENANT,
      wabaId: 'WABA_DEV',
      onboardingType: 'dev',
      accessTokenEnc: encryptSecret('EAAG-dev-token', masterKey),
    })
    .returning();
  await seed.db.insert(phoneNumbers).values({
    tenantId: TENANT,
    whatsappAccountId: account!.id,
    phoneNumberId: PHONE_NUMBER_ID,
    displayPhone: '+91 93509 83656',
  });
  await seed.pool.end();

  const appUrl = new URL(ownerUrl);
  appUrl.username = 'qualify_app';
  appUrl.password = 'app_pw';
  const app = createDb(appUrl.toString(), { max: 3 });

  const playbook = await withTenant(app.db, TENANT, (tx) =>
    createPublishedPlaybook(tx, {
      tenantId: TENANT,
      name: 'Travel packages',
      templateKey: TRAVEL_TEMPLATE_KEY,
      config: travelPlaybookTemplate('Sunrise Holidays'),
      isDefault: true,
    }),
  );

  return {
    container,
    app,
    playbookVersionId: playbook!.versionId,
    stop: async () => {
      await app.pool.end();
      await container.stop();
    },
  };
}

/** A lead's activity log (D-091), oldest first; with no lead, the tenant's whole feed. */
export async function activityOf(db: Database, leadId?: string) {
  const page = await withTenant(db, TENANT, (tx) =>
    listActivity(tx, { ...(leadId ? { leadId } : {}), limit: 100 }),
  );
  return page.items.reverse();
}

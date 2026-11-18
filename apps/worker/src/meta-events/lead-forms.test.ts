// Integration test of Meta lead forms: real Postgres (RLS), fake Graph API, no AI (word matching).
import { randomBytes } from 'node:crypto';
import {
  eq,
  facebookPages,
  inboundMetaEvents,
  leadFormMappings,
  leadFormSubmissions,
  leads,
  withTenant,
} from '@qualify/db';
import { encryptSecret, type MetaLead, type MetaLeadForm } from '@qualify/integrations';
import type { ContactJob } from '@qualify/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, TENANT, type TestDb } from '../test/test-db.ts';
import type { LeadFormClient } from './lead-forms.ts';
import { processMetaEvent, type ProcessorDeps } from './process-meta-event.ts';

const masterKey = randomBytes(32);
let testDb: TestDb;
const PAGE_ID = 'page_123';

const form: MetaLeadForm = {
  id: 'form_1',
  name: 'Travel enquiry',
  questions: [
    { key: 'full_name', label: 'Full name' },
    { key: 'phone_number', label: 'Phone number' },
    { key: 'when_are_you_planning_to_travel?', label: 'When are you planning to travel?' },
    {
      key: 'what_kind_of_trip_is_this?',
      label: 'What kind of trip is this?',
      options: [
        { key: 'family', value: 'Family' },
        { key: 'honeymoon', value: 'Honeymoon' },
      ],
    },
  ],
};

function lead(leadgenId: string, phone: string): MetaLead {
  return {
    id: leadgenId,
    form_id: 'form_1',
    field_data: [
      { name: 'full_name', values: ['Amit Kumar'] },
      { name: 'phone_number', values: [phone] },
      { name: 'when_are_you_planning_to_travel?', values: ['december_2026'] },
      { name: 'what_kind_of_trip_is_this?', values: ['family'] },
    ],
  };
}

let graph: { getLead: ReturnType<typeof vi.fn>; getLeadForm: ReturnType<typeof vi.fn> };
let enqueueContact: ReturnType<typeof vi.fn<(job: ContactJob) => Promise<void>>>;

function deps(): ProcessorDeps {
  return {
    db: testDb.app.db,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    allowlist: ['*'],
    isProduction: false,
    enqueueRespond: vi.fn(async () => undefined),
    leadForms: {
      masterKey,
      createClient: () => graph as unknown as LeadFormClient,
      llm: null,
      model: 'fake-model',
      reasoningEffort: 'low',
      enqueueContact,
    },
  };
}

async function deliver(leadgenId: string): Promise<void> {
  const [event] = await testDb.app.db
    .insert(inboundMetaEvents)
    .values({
      object: 'page',
      payload: {
        object: 'page',
        entry: [
          {
            id: PAGE_ID,
            time: 1763400000,
            changes: [
              {
                field: 'leadgen',
                value: {
                  leadgen_id: leadgenId,
                  page_id: PAGE_ID,
                  form_id: 'form_1',
                  ad_id: 'ad_9',
                  created_time: 1763400000,
                },
              },
            ],
          },
        ],
      },
    })
    .returning();
  await processMetaEvent(event!.id, deps());
}

beforeAll(async () => {
  testDb = await startTestDb(masterKey);
  await withTenant(testDb.app.db, TENANT, (tx) =>
    tx.insert(facebookPages).values({
      tenantId: TENANT,
      pageId: PAGE_ID,
      name: 'Sunrise Holidays',
      accessTokenEnc: encryptSecret('EAAG-page-token', masterKey),
    }),
  );
  graph = {
    getLead: vi.fn(async (id: string) => lead(id, '+91 98000 00031')),
    getLeadForm: vi.fn(async () => form),
  };
  enqueueContact = vi.fn(async () => undefined);
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

describe('Meta lead forms', () => {
  it('creates a scored lead from a form submission and queues the opening', async () => {
    await deliver('lg_1');

    const [created] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(leads).where(eq(leads.phoneE164, '+919800000031')),
    );
    expect(created).toMatchObject({
      name: 'Amit Kumar',
      source: 'meta_form',
      fields: { travel_month: '2026-12', trip_type: 'Family' },
    });
    expect(created!.score).not.toBeNull();
    expect(created!.attribution).toMatchObject({
      channel: 'meta_form',
      formName: 'Travel enquiry',
      adId: 'ad_9',
    });
    expect(enqueueContact).toHaveBeenCalledWith({ tenantId: TENANT, leadId: created!.id });

    const [submission] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(leadFormSubmissions),
    );
    expect(submission).toMatchObject({ leadgenId: 'lg_1', leadId: created!.id, adId: 'ad_9' });
    const [mapping] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(leadFormMappings),
    );
    expect(mapping).toMatchObject({ formName: 'Travel enquiry', source: 'auto' });
  });

  it('ignores a retried webhook for the same submission', async () => {
    // (Call counts are reset between tests.)
    await deliver('lg_1');
    expect(enqueueContact).not.toHaveBeenCalled();
    expect(graph.getLead).not.toHaveBeenCalled();
  });

  it('reuses the stored mapping for the next lead of the same form', async () => {
    graph.getLead.mockImplementationOnce(async (id: string) => lead(id, '+91 98000 00032'));
    await deliver('lg_2');
    const rows = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(leadFormMappings),
    );
    expect(rows).toHaveLength(1);
    expect(graph.getLeadForm).toHaveBeenCalledTimes(1);
    expect(enqueueContact).toHaveBeenCalledTimes(1);
  });

  it('skips Pages that belong to no workspace', async () => {
    const [event] = await testDb.app.db
      .insert(inboundMetaEvents)
      .values({
        object: 'page',
        payload: {
          object: 'page',
          entry: [
            {
              id: 'page_other',
              changes: [
                {
                  field: 'leadgen',
                  value: { leadgen_id: 'lg_x', page_id: 'page_other', form_id: 'form_9' },
                },
              ],
            },
          ],
        },
      })
      .returning();
    await processMetaEvent(event!.id, deps());
    expect(graph.getLead).not.toHaveBeenCalledWith('lg_x');
  });
});

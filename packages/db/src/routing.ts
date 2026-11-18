import { sql } from 'drizzle-orm';
import type { Database } from './client.ts';

/**
 * Finds which tenant owns a WhatsApp phone number (webhook routing).
 * Uses the narrow SECURITY DEFINER function from migration 0003, so the caller needs no
 * tenant context and gains no read access to other tenants' rows.
 */
export async function resolveTenantByPhoneNumberId(
  db: Database,
  phoneNumberId: string,
): Promise<string | null> {
  const result = await db.execute<{ tenant_id: string | null }>(
    sql`select resolve_tenant_by_phone_number_id(${phoneNumberId}) as tenant_id`,
  );
  return result.rows[0]?.tenant_id ?? null;
}

/** Finds which tenant owns a Facebook Page (leadgen webhook routing, migration 0012). */
export async function resolveTenantByPageId(db: Database, pageId: string): Promise<string | null> {
  const result = await db.execute<{ tenant_id: string | null }>(
    sql`select resolve_tenant_by_page_id(${pageId}) as tenant_id`,
  );
  return result.rows[0]?.tenant_id ?? null;
}

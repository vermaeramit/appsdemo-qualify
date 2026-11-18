import { and, eq, sql } from 'drizzle-orm';
import {
  auditLogs,
  leadFormSubmissions,
  leads,
  messages,
  webhookDeliveries,
} from './schema/index.ts';
import type { Transaction } from './tenant.ts';

export interface LeadDeletion {
  messages: number;
  formSubmissions: number;
  webhookDeliveries: number;
  auditEntriesRedacted: number;
}

/**
 * Deletes a lead and everything that carries its data (D-085), inside withTenant: its messages,
 * its raw lead form submissions and the webhook deliveries with its payload. Audit entries about
 * it keep who did what and when, but their details (answers, phone) are emptied. Returns null
 * when the lead doesn't exist in this tenant.
 */
export async function deleteLeadCompletely(
  tx: Transaction,
  input: { tenantId: string; leadId: string },
): Promise<LeadDeletion | null> {
  const [lead] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(eq(leads.id, input.leadId))
    .limit(1);
  if (!lead) return null;

  const [counted] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.leadId, input.leadId));
  const deliveries = await tx
    .delete(webhookDeliveries)
    .where(eq(webhookDeliveries.leadId, input.leadId))
    .returning({ id: webhookDeliveries.id });
  const submissions = await tx
    .delete(leadFormSubmissions)
    .where(eq(leadFormSubmissions.leadId, input.leadId))
    .returning({ id: leadFormSubmissions.id });
  const redacted = await tx
    .update(auditLogs)
    .set({ metadata: { redacted: true } })
    .where(and(eq(auditLogs.target, input.leadId), sql`${auditLogs.action} <> 'lead.deleted'`))
    .returning({ id: auditLogs.id });
  // Messages go with the lead (ON DELETE CASCADE).
  await tx.delete(leads).where(eq(leads.id, input.leadId));

  return {
    messages: counted?.total ?? 0,
    formSubmissions: submissions.length,
    webhookDeliveries: deliveries.length,
    auditEntriesRedacted: redacted.length,
  };
}

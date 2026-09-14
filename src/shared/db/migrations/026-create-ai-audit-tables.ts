/**
 * Migration 026: Create AI Decision Audit Trail Tables (Shared DB)
 * Comprehensive audit trail for all AI/ML model predictions, explanations, and governance events
 */

import type { PoolClient } from 'pg';
import { createAiAuditCoreTables } from '../ai-audit-core-queries';
import { createAiAuditGovernanceTables } from '../ai-audit-governance-queries';
import { createAiAuditViews, dropAiAuditTables } from '../ai-audit-views-queries';

export const id = '026-create-ai-audit-tables';
export const description = 'Create AI decision audit trail tables: predictions, explanations, governance, feature importance';

export async function up(client: PoolClient): Promise<void> {
  await createAiAuditCoreTables(client);
  await createAiAuditGovernanceTables(client);
  await createAiAuditViews(client);
}

export async function down(client: PoolClient): Promise<void> {
  await dropAiAuditTables(client);
}

/**
 * Deterministic JSON stringify and SHA-256 hash calculation for Tenant Audit Logs
 */

import { createHash } from 'crypto';
import type { TenantAuditHashInput } from './tenant-audit-types';

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const typedObj = obj as Record<string, unknown>;
  const keys = Object.keys(typedObj).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${canonicalJsonStringify(typedObj[k])}`);
  return '{' + parts.join(',') + '}';
}

export function computeTenantAuditHash(entry: TenantAuditHashInput): string {
  let timeStr: string;
  if (entry.created_at instanceof Date) {
    timeStr = entry.created_at.toISOString();
  } else {
    const date = new Date(entry.created_at);
    timeStr = !isNaN(date.getTime()) ? date.toISOString() : entry.created_at;
  }

  const payloadObj = {
    tenant_id: entry.tenant_id,
    sequence_number: String(entry.sequence_number),
    event_type: entry.event_type,
    action_by: entry.action_by,
    reason: entry.reason,
    metadata: entry.metadata,
    previous_hash: entry.previous_hash,
    created_at: timeStr,
  };

  const payload = canonicalJsonStringify(payloadObj);
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Zod validation schema for audit-log entries.
 *
 * Enforces field presence, typing, non-empty strings, ISO timestamp validity,
 * and maximum metadata byte size before persistence.
 *
 * @module seed/security/schemas/audit-entry-schema
 */

import { z } from 'zod';
import type { IAuditEntry, AuditResult } from '../types';

export const METADATA_MAX_BYTES = 4_096;

export const auditResultSchema = z.custom<AuditResult>(
  (v) => typeof v === 'string' && ['success', 'failure', 'denied'].includes(v as AuditResult),
  { message: "IAuditEntry.result must be one of 'success'|'failure'|'denied'" },
);

export const auditEntrySchema = z.object({
  id: z.custom<string>(
    (v) => typeof v === 'string' && v.trim() !== '',
    { message: 'IAuditEntry.id must be a non-empty string' },
  ),
  timestamp: z.custom<string>(
    (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)),
    { message: 'IAuditEntry.timestamp must be an ISO-8601 string' },
  ),
  actor: z.custom<string>(
    (v) => typeof v === 'string' && v.trim() !== '',
    { message: 'IAuditEntry.actor must be a non-empty string' },
  ),
  action: z.custom<string>(
    (v) => typeof v === 'string' && v.trim() !== '',
    { message: 'IAuditEntry.action must be a non-empty string' },
  ),
  resource: z.custom<string>(
    (v) => typeof v === 'string' && v.trim() !== '',
    { message: 'IAuditEntry.resource must be a non-empty string' },
  ),
  result: auditResultSchema,
  metadata: z
    .custom<Record<string, unknown>>(
      (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
      { message: 'IAuditEntry.metadata must be a plain object' },
    )
    .refine(
      (v) => {
        try {
          return Buffer.byteLength(JSON.stringify(v), 'utf8') <= METADATA_MAX_BYTES;
        } catch {
          return false;
        }
      },
      { message: `IAuditEntry.metadata exceeds ${METADATA_MAX_BYTES} bytes` },
    ),
  ipHash: z.custom<string>(
    (v) => typeof v === 'string' && /^[0-9a-f]+$/i.test(v),
    { message: 'IAuditEntry.ipHash must be a non-empty hex string' },
  ),
  tenantId: z.string().min(1).optional(),
});

export type AuditEntryInput = z.infer<typeof auditEntrySchema>;

/**
 * Validates an unknown object against `auditEntrySchema`.
 * Throws ZodError on failure.
 */
export function validateAuditEntryWithZod(entry: unknown): IAuditEntry {
  return auditEntrySchema.parse(entry) as IAuditEntry;
}

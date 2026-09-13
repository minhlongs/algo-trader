/**
 * Tenant Audit Log Types
 */

export interface TenantAuditLog {
  id: string;
  tenant_id: string;
  sequence_number: number;
  event_type: string;
  action_by: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  hash: string;
  previous_hash: string | null;
  created_at: Date;
}

export interface TenantChainVerificationResult {
  valid: boolean;
  brokenAt?: number;
  reason?: string;
}

export interface TenantAuditHashInput {
  tenant_id: string;
  sequence_number: number;
  event_type: string;
  action_by: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  previous_hash: string | null;
  created_at: Date | string;
}

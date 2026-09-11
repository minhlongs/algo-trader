/**
 * KYC Types and Constants
 * Phase 35 Compliance — identity verification models and status enumerations.
 */

export const VALID_STATUSES = ['pending', 'in_progress', 'approved', 'rejected', 'expired'] as const;
export type KycStatus = (typeof VALID_STATUSES)[number];

export const VALID_LEVELS = ['basic', 'advanced', 'full'] as const;
export type KycVerificationLevel = (typeof VALID_LEVELS)[number];

export const ALLOWED_STATUSES = ['approved', 'rejected', 'pending'] as const;
export type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export interface KycInitRequest {
  tenantId?: string;
  providerAccountId?: string;
  verificationLevel?: string;
}

export interface KycWebhookRequest {
  tenantId?: string;
  status?: string;
  id?: string;
  providerReference?: string;
}

export interface KycVerificationRow {
  id: string;
  provider: string;
  status: string;
  verification_level: string;
  provider_reference: string | null;
  result: unknown;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

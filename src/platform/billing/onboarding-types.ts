import type { LicenseTier } from '../../shared/types/license';

/** TTL for pending signups: 15 minutes in ms */
export const PENDING_TTL_MS = 15 * 60 * 1000;

export interface SignupRequest {
  email: string;
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  walletAddress?: string;
}

export interface SignupResult {
  pendingId: string;
  email: string;
  verificationToken: string;
  expiresAt: number;
}

export interface ActivationResult {
  licenseKey: string;
  tier: LicenseTier;
  apiInstructions: string;
}

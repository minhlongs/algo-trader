/**
 * Referral Payout — payout-specific types and method configurations.
 *
 * Extracted from referral-payout.ts. Re-exported from the facade so all
 * existing importers (e.g. referral-payout-repository.ts) see an identical API.
 */

import type { PayoutStatus } from './types';
export type { PayoutStatus };

/* ── payout-specific types ──────────────────────────────── */

export type PayoutMethod = 'crypto_btc' | 'crypto_eth' | 'crypto_usdt' | 'bank_wire' | 'bank_ach';

export interface PayoutMethodConfig {
  method: PayoutMethod;
  label: string;
  minimumPayout: number; // in USD
  processingDays: number;
  feePercent: number;
}

export interface ReferralEarnings {
  tenantId: string;
  totalEarned: number;
  totalPaidOut: number;
  pendingBalance: number;
  lastPayoutAt: Date | null;
  payoutMethod: PayoutMethod | null;
  payoutAddress: string | null; // wallet or bank account
}

export interface PayoutHistoryRecord {
  id: string;
  tenantId: string;
  amount: number;
  currency: string;
  method: PayoutMethod;
  status: PayoutStatus;
  commissionIds: string[];
  transactionId: string | null;
  payoutAddress: string;
  processedAt: Date | null;
  createdAt: Date;
  error: string | null;
}

export interface ProcessPayoutResult {
  success: boolean;
  payoutId: string;
  amount: number;
  method: PayoutMethod;
  transactionId?: string;
  error?: string;
}

/**
 * Structural interface the ReferralPayout facade must satisfy.
 *
 * Declared in the types module (not the class module) so payout-read.ts and
 * process-payout.ts can type their `this` parameter without a circular
 * runtime import — the facade class implements these methods directly.
 */
export interface ReferralPayoutLike {
  getEarnings(tenantId: string): Promise<ReferralEarnings>;
  executeTransfer(method: PayoutMethod, address: string, amount: number): Promise<string>;
}

/* ── payout method configurations ───────────────────────── */

export const PAYOUT_METHODS: Record<PayoutMethod, PayoutMethodConfig> = {
  crypto_btc: { method: 'crypto_btc', label: 'Bitcoin (BTC)', minimumPayout: 25, processingDays: 1, feePercent: 0.5 },
  crypto_eth: { method: 'crypto_eth', label: 'Ethereum (ETH)', minimumPayout: 25, processingDays: 1, feePercent: 0.5 },
  crypto_usdt: { method: 'crypto_usdt', label: 'USDT (TRC-20)', minimumPayout: 10, processingDays: 1, feePercent: 0.3 },
  bank_wire: { method: 'bank_wire', label: 'Bank Wire', minimumPayout: 100, processingDays: 3, feePercent: 2.0 },
  bank_ach: { method: 'bank_ach', label: 'Bank ACH', minimumPayout: 50, processingDays: 2, feePercent: 1.0 },
};

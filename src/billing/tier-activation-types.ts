/**
 * Tier Activation & Webhook Ingestion Types
 * Strict Zod validation schemas and entitlement records for subscriber onboarding.
 */

import { z } from 'zod';

export const TierEnum = z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER']);
export type Tier = z.infer<typeof TierEnum>;

export const NowPaymentsIpnSchema = z.object({
  payment_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  payment_status: z.string(),
  pay_address: z.string().optional(),
  price_amount: z.number().nonnegative(),
  price_currency: z.string().default('USD'),
  pay_amount: z.number().optional(),
  pay_currency: z.string().optional(),
  order_id: z.string().optional(),
  order_description: z.string().optional(),
  invoice_id: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v !== undefined ? String(v) : undefined)),
  actually_paid: z.number().optional(),
  outcome_amount: z.number().optional(),
  outcome_currency: z.string().optional(),
});

export type NowPaymentsIpnInput = z.infer<typeof NowPaymentsIpnSchema>;

export interface TierEntitlements {
  tier: Tier;
  strategyQuota: number;
  apiCallsPerMonth: number;
  features: string[];
  maxLiveSignals: number;
}

export const TIER_ENTITLEMENTS: Record<Tier, TierEntitlements> = {
  BASIC: {
    tier: 'BASIC',
    strategyQuota: 5,
    apiCallsPerMonth: 10000,
    features: ['basic-backtest', 'signals-stream'],
    maxLiveSignals: 10,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    strategyQuota: 20,
    apiCallsPerMonth: 50000,
    features: ['ml-models', 'advanced-backtest', 'signals-stream', 'telegram-alerts'],
    maxLiveSignals: 50,
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    strategyQuota: 100,
    apiCallsPerMonth: 500000,
    features: ['unlimited-backtest', 'custom-models', 'dedicated-instance', 'priority-support'],
    maxLiveSignals: 200,
  },
  MASTER: {
    tier: 'MASTER',
    strategyQuota: 999,
    apiCallsPerMonth: 999999,
    features: ['unlimited-all', 'co-location', 'custom-strategies', 'white-glove'],
    maxLiveSignals: 999,
  },
};

export interface TenantSubscriptionRecord {
  tenantId: string;
  tier: Tier;
  strategyQuota: number;
  paymentId: string;
  activatedAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  processedPayments: string[];
}

export interface SubscriptionStore {
  getTenant(tenantId: string): Promise<TenantSubscriptionRecord | null>;
  saveTenant(record: TenantSubscriptionRecord): Promise<void>;
  isPaymentProcessed(paymentId: string): Promise<boolean>;
}

export interface ActivationResult {
  success: boolean;
  tenantId: string;
  tier: Tier;
  paymentId: string;
  strategyQuotaProvisioned: number;
  isDuplicate: boolean;
  activatedAt: string;
  error?: string;
}

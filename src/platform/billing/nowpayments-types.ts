/**
 * NOWPayments Types and Tier Configuration
 */

import { LicenseTier } from '../../shared/types/license';

// Canonical pricing (aligned with PRICING_TIERS)
// PRO=$99/mo, ENTERPRISE=$299/mo, MASTER=$999/mo
export const CASHCLAW_PRICES: Record<string, number> = {
  PRO: 99,
  ENTERPRISE: 299,
  MASTER: 999,
};

// NOWPayments IPN payload from webhook
export interface NowPaymentsIpnPayload {
  payment_id: string;
  payment_status: NowPaymentsStatus;
  pay_address?: string;
  price_amount: number;
  price_currency: string;
  pay_amount?: number;
  pay_currency?: string;
  order_id?: string;
  order_description?: string;
  invoice_id?: string;
  actually_paid?: number;
  outcome_amount?: number;
  outcome_currency?: string;
}

export type NowPaymentsStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired';

// Tier configuration with pre-created invoice IDs from NOWPayments dashboard
export interface NowPaymentsTierConfig {
  tier: string;
  invoiceId: string;
  price: number;
  currency: string;
  name: string;
}

// Configure invoice IDs from NOWPayments dashboard (customers set these in .env or config)
export const NOWPAYMENTS_TIERS: Record<string, NowPaymentsTierConfig> = {
  PRO: {
    tier: LicenseTier.PRO,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_PRO || '',
    price: 99,
    currency: 'USD',
    name: 'Pro Trader',
  },
  ENTERPRISE: {
    tier: LicenseTier.ENTERPRISE,
    invoiceId: process.env.NOWPAYMENTS_INVOICE_ENTERPRISE || '',
    price: 299,
    currency: 'USD',
    name: 'Enterprise',
  },
  MASTER: {
    tier: 'MASTER',
    invoiceId: process.env.NOWPAYMENTS_INVOICE_MASTER || '',
    price: 999,
    currency: 'USD',
    name: 'Master',
  },
  SIGNALS_BASIC: {
    tier: 'SIGNALS_BASIC',
    invoiceId: process.env.NOWPAYMENTS_INVOICE_SIGNALS_BASIC || '',
    price: 29,
    currency: 'USD',
    name: 'Signals Basic',
  },
  SIGNALS_PRO: {
    tier: 'SIGNALS_PRO',
    invoiceId: process.env.NOWPAYMENTS_INVOICE_SIGNALS_PRO || '',
    price: 99,
    currency: 'USD',
    name: 'Signals Pro',
  },
  SIGNALS_ENTERPRISE: {
    tier: 'SIGNALS_ENTERPRISE',
    invoiceId: process.env.NOWPAYMENTS_INVOICE_SIGNALS_ENTERPRISE || '',
    price: 299,
    currency: 'USD',
    name: 'Signals Enterprise',
  },
};

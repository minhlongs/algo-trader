/**
 * Enterprise plan definitions — single source of truth for dashboard UI.
 * Tiers: PRO ($99/mo) / ENTERPRISE ($299/mo) / MASTER ($999/mo).
 * Monthly subscription, invoice-based. No self-serve checkout.
 * Keep copy free of "AI", "health", "wellness", "medical" per Polar acceptable-use rule.
 */

export type EnterprisePlanKey = 'PRO' | 'ENTERPRISE' | 'MASTER';

export interface EnterprisePlan {
  name: string;
  price: string;
  acv: number;
  tagline: string;
  features: string[];
}

export const ENTERPRISE_PLANS: Record<EnterprisePlanKey, EnterprisePlan> = {
  PRO: {
    name: 'PRO',
    price: '$99 / mo',
    acv: 1_188,
    tagline: 'For individual traders and small teams',
    features: [
      'Up to 5 strategy seats',
      'Dedicated onboarding session',
      'SLA: next-business-day support',
      'Custom position & loss limits',
      'API + webhook access',
      'Monthly performance reports',
    ],
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    price: '$299 / mo',
    acv: 3_588,
    tagline: 'For growing funds and trading desks',
    features: [
      'Up to 25 strategy seats',
      'Dedicated Account Manager',
      'SLA: 4-hour response',
      'Custom risk parameters per desk',
      'White-label reporting',
      'Weekly executive review',
      'Priority feature roadmap access',
    ],
  },
  MASTER: {
    name: 'MASTER',
    price: '$999 / mo',
    acv: 11_988,
    tagline: 'For institutional desks requiring full control',
    features: [
      'Unlimited strategy seats',
      'Dedicated TAM + engineering support',
      'SLA: 1-hour response, 99.9% uptime',
      'Custom integrations & private deployments',
      'Full audit logs & compliance exports',
      'Daily executive review',
      'Co-development on roadmap items',
    ],
  },
};

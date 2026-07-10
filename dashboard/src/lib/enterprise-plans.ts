/**
 * Enterprise plan definitions — single source of truth for dashboard UI.
 * Pricing: $99 / $299 / $999 / month. Invoice-based for enterprise tiers.
 */

export type EnterprisePlanKey = 'pro' | 'enterprise' | 'master';

export interface EnterprisePlan {
  name: string;
  price: string;
  acv: number;
  tagline: string;
  features: string[];
}

export const ENTERPRISE_PLANS: Record<EnterprisePlanKey, EnterprisePlan> = {
  pro: {
    name: 'Pro',
    price: '$99 / mo',
    acv: 1_188,
    tagline: 'For serious traders ready to scale',
    features: [
      'Up to 5 active strategies',
      'Advanced market scanning',
      'Telegram signal alerts',
      'Custom position & loss limits',
      'API + webhook access',
      'Email support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: '$299 / mo',
    acv: 3_588,
    tagline: 'For funds running multi-strategy operations',
    features: [
      'Up to 20 active strategies',
      'All market access',
      'Dedicated Technical Account Manager',
      'Custom risk parameters per desk',
      'White-label reporting',
      'Monthly executive review',
      'Priority feature roadmap access',
      'SLA: 4-hour response',
    ],
  },
  master: {
    name: 'Master',
    price: '$999 / mo',
    acv: 11_988,
    tagline: 'For institutional desks requiring full control',
    features: [
      'Unlimited strategies',
      'Dedicated TAM + engineering pod',
      'SLA: 1-hour response, 99.9% uptime',
      'Custom integrations & private deployments',
      'Full audit logs & compliance exports',
      'Weekly executive review',
      'Co-development on roadmap items',
      'On-premise deployment option',
    ],
  },
};

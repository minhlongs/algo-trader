/**
 * Enterprise plan definitions — single source of truth for dashboard UI.
 * Pricing: $49k / $199k / $499k, invoice-based. No Polar.sh checkout.
 * Keep copy free of "AI", "health", "wellness", "medical" per Polar acceptable-use rule.
 */

export type EnterprisePlanKey = 'growth' | 'scale' | 'unlimited';

export interface EnterprisePlan {
  name: string;
  price: string;
  acv: number;
  tagline: string;
  features: string[];
}

export const ENTERPRISE_PLANS: Record<EnterprisePlanKey, EnterprisePlan> = {
  growth: {
    name: 'Growth',
    price: '$49k / yr',
    acv: 49_000,
    tagline: 'For teams getting systematic at scale',
    features: [
      'Up to 10 strategy seats',
      'Dedicated onboarding session',
      'SLA: next-business-day support',
      'Custom position & loss limits',
      'API + webhook access',
      'Quarterly business review',
    ],
  },
  scale: {
    name: 'Scale',
    price: '$199k / yr',
    acv: 199_000,
    tagline: 'For funds running multi-strategy operations',
    features: [
      'Up to 50 strategy seats',
      'Dedicated Technical Account Manager',
      'SLA: 4-hour response',
      'Custom risk parameters per desk',
      'White-label reporting',
      'Monthly executive review',
      'Priority feature roadmap access',
    ],
  },
  unlimited: {
    name: 'Unlimited',
    price: '$499k / yr',
    acv: 499_000,
    tagline: 'For institutional desks requiring full control',
    features: [
      'Unlimited strategy seats',
      'Dedicated TAM + engineering pod',
      'SLA: 1-hour response, 99.9% uptime',
      'Custom integrations & private deployments',
      'Full audit logs & compliance exports',
      'Weekly executive review',
      'Co-development on roadmap items',
    ],
  },
};

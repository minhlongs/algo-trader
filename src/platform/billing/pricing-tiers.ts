/**
 * Pricing Tiers Configuration
 * ME IDEA Business Viability - C1 criterion
 *
 * Defines commercial pricing tiers for the algo-trader platform.
 * These tiers map to license tiers and feature sets.
 */

export interface PricingTier {
	name: string;
	price: number; // monthly in USD
	strategies: number; // max concurrent strategies
	markets: string[]; // supported markets
	apiCallsPerMonth: number;
	features: string[];
	requestsPerMin: number; // API rate limit per minute
	supportLevel: 'community' | 'email' | 'priority' | 'dedicated';
}

export const PRICING_TIERS: Record<string, PricingTier> = {
	FREE: {
		name: 'Free',
		price: 0,
		strategies: 1,
		markets: ['polymarket'],
		apiCallsPerMonth: 1000,
		features: [
			'basic-backtest',
			'paper-trading',
			'community-support',
			'basic-strategies',
		],
		supportLevel: 'community',
		requestsPerMin: 10,
	},
	PRO: {
		name: 'Pro',
		price: 99,
		strategies: 5,
		markets: ['polymarket', 'kalshi', 'limitless'],
		apiCallsPerMonth: 10000,
		features: [
			'ml-models',
			'advanced-backtest',
			'telegram-alerts',
			'premium-data',
			'strategy-sharing',
			'email-support',
		],
		supportLevel: 'email',
		requestsPerMin: 100,
	},
	ENTERPRISE: {
		name: 'Enterprise',
		price: 299,
		strategies: 20,
		markets: ['all'],
		apiCallsPerMonth: 100000,
		features: [
			'unlimited',
			'priority-support',
			'custom-strategies',
			'dedicated-instance',
			'slas',
			'on-premise-option',
			'white-glove-onboarding',
		],
		supportLevel: 'dedicated',
		requestsPerMin: 1000,
	},
  MASTER: {
    name: 'Master',
    price: 999,
    strategies: 999,
    markets: ['all'],
    apiCallsPerMonth: 999999,
    features: [
      'unlimited',
      'dedicated-support',
      'custom-strategies',
      'dedicated-instance',
      'slas',
      'on-premise-option',
      'white-glove-onboarding',
      'co-location-assistance',
    ],
    supportLevel: 'dedicated',
    requestsPerMin: 9999,
  }
};

/**
 * Get pricing tier by license tier
 */
export function getPricingTier(licenseTier: string): PricingTier {
	return PRICING_TIERS[licenseTier.toUpperCase()] || PRICING_TIERS.FREE;
}

/**
 * Calculate annual price with 20% discount
 */
export function annualPrice(tier: string): number {
	const monthly = getPricingTier(tier).price;
	return monthly * 12 * 0.8;
}

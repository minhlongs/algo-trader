import type { TierKey, Signal } from '../../desk/signal/signal-types';

export type { TierKey, Signal };

export interface GetSignalsArgs {
  apiKey: string;
  tier: TierKey;
  since?: number;
  limit?: number;
}

export interface GetSubscriptionStatusArgs {
  apiKey: string;
}

export interface ResourceQuery {
  apiKey: string;
  tier: TierKey;
  since: number;
  limit: number;
}

export const TIER_RANK: Record<TierKey, number> = { FREE: 0, BASIC: 1, PRO: 2, ENTERPRISE: 3 };
export const SIGNALS_BASIC_RANK = 0; // any paid tier counts

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

export const TIER_RANK: Record<TierKey, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
export const SIGNALS_BASIC_RANK = 0; // any paid tier counts

/**
 * Price Impact Estimator - Per-market State Management
 */

import type { OpenPosition, PriceImpactEstimatorConfig } from './price-impact-estimator-types';
import { updateImpactEma } from './price-impact-estimator-algorithms';

export interface PriceImpactEstimatorState {
  impactEmaState: Map<string, number>;
  positions: OpenPosition[];
  cooldowns: Map<string, number>;
  updateImpactEmaState: (tokenId: string, value: number) => number;
  isOnCooldown: (tokenId: string) => boolean;
  hasPosition: (tokenId: string) => boolean;
}

export function createPriceImpactEstimatorState(
  cfg: PriceImpactEstimatorConfig
): PriceImpactEstimatorState {
  const impactEmaState = new Map<string, number>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  function updateImpactEmaState(tokenId: string, value: number): number {
    const prev = impactEmaState.get(tokenId) ?? null;
    const ema = updateImpactEma(prev, value, cfg.impactEmaAlpha);
    impactEmaState.set(tokenId, ema);
    return ema;
  }

  function isOnCooldown(tokenId: string): boolean {
    const until = cooldowns.get(tokenId) ?? 0;
    return Date.now() < until;
  }

  function hasPosition(tokenId: string): boolean {
    return positions.some((p) => p.tokenId === tokenId);
  }

  return {
    impactEmaState,
    positions,
    cooldowns,
    updateImpactEmaState,
    isOnCooldown,
    hasPosition,
  };
}

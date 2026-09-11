/**
 * Pairs Statistical Arbitrage Strategy — Barrel facade for backward compatibility.
 */

import type { StrategyDeps } from './base-polymarket-strategy';
import { PairsStatArbStrategy } from './pairs-stat-arb-strategy';

export * from './pairs-stat-arb-types';
export * from './pairs-stat-arb-math';
export * from './pairs-stat-arb-strategy';

// ── Legacy factory ───────────────────────────────────────────────────────────

export function createPairsStatArbTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new PairsStatArbStrategy(deps);
  return strategy.toTickFn();
}

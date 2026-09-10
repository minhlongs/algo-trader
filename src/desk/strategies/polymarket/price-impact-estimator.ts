/**
 * Price Impact Estimator strategy for Polymarket binary markets.
 *
 * Estimates the price impact of hypothetical orders by analyzing orderbook depth.
 * When the estimated impact of a moderate-sized order is unusually low (deep
 * liquidity at current price), it signals a strong support/resistance level.
 * Trades in the direction of the deep side, expecting price to bounce off the
 * liquidity wall.
 *
 * Signal logic:
 *   1. For each market, simulate eating through N levels of the book on both sides
 *   2. Calculate price impact = (final fill price - current mid) / current mid
 *      for a hypothetical order
 *   3. When buy-side impact << sell-side impact → strong bid support → BUY YES
 *   4. When sell-side impact << buy-side impact → strong ask resistance → BUY NO
 *   5. Require asymmetry ratio > threshold to trade
 */
import { logger } from '../../core/logger';

// ── Re-export all public symbols for backward compatibility ──────────────────

export type {
  PriceImpactEstimatorConfig,
  OpenPosition,
  PriceImpactEstimatorDeps,
} from './price-impact-estimator-types';

export {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './price-impact-estimator-types';

export {
  simulatePriceImpact,
  calcImpactAsymmetry,
  determineSide,
  updateImpactEma,
  bestBidAsk,
} from './price-impact-estimator-algorithms';

// ── Internal imports ─────────────────────────────────────────────────────────

import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  type PriceImpactEstimatorConfig,
  type PriceImpactEstimatorDeps,
} from './price-impact-estimator-types';
import { createPriceImpactEstimatorState } from './price-impact-estimator-state';
import { checkPriceImpactExits } from './price-impact-estimator-exits';
import { scanPriceImpactEntries } from './price-impact-estimator-entries';

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createPriceImpactEstimatorTick(deps: PriceImpactEstimatorDeps): () => Promise<void> {
  const { gamma } = deps;
  const cfg: PriceImpactEstimatorConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const state = createPriceImpactEstimatorState(cfg);

  return async (): Promise<void> => {
    try {
      // 1. Check exits first
      await checkPriceImpactExits(deps, cfg, state);

      // 2. Discover trending markets
      const markets = await gamma.getTrending(15);

      // 3. Scan for entries
      await scanPriceImpactEntries(markets, deps, cfg, state);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: state.positions.length,
        trackedMarkets: state.impactEmaState.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}

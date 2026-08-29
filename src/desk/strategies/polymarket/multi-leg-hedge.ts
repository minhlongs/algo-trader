/**
 * Multi-Leg Hedge strategy for Polymarket event groups (facade).
 *
 * Within a Polymarket event group (e.g., "Who will win the election?"), the sum
 * of all outcome YES prices should equal ~1.0. When total probability deviates
 * significantly from 1.0, there is an arbitrage/hedging opportunity.
 *
 * Signal logic:
 *   deviation = Σ(yesPrices) - 1.0
 *
 *   |deviation| > deviationThreshold:
 *     deviation > 0 (overpriced) → SELL most overpriced leg (buy NO)
 *     deviation < 0 (underpriced) → BUY most underpriced leg (buy YES)
 *
 *   Optionally hedge with offsetting position on second-most mispriced leg.
 *
 * Exit logic lives in multi-leg-hedge-exits.ts; entry logic in
 * multi-leg-hedge-entries.ts; config + pure helpers in multi-leg-hedge-config.ts.
 */
import { logger } from '../../core/logger';
import {
  type HedgePosition,
  type MultiLegHedgeConfig,
  type MultiLegHedgeDeps,
  DEFAULT_CONFIG,
  STRATEGY_NAME,
} from './multi-leg-hedge-config';
import { type MultiLegHedgeTickContext, checkExitsFor } from './multi-leg-hedge-exits';
import { scanEntriesFor } from './multi-leg-hedge-entries';

// ── Re-exports (public API — importers must not change) ─────────────────────
export type { MultiLegHedgeConfig, MultiLegHedgeDeps } from './multi-leg-hedge-config';
export { calcEventDeviation, findMostMispriced, calcHedgeSize, shouldEnterHedge } from './multi-leg-hedge-config';

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createMultiLegHedgeTick(deps: MultiLegHedgeDeps): () => Promise<void> {
  const { clob, orderManager, eventBus, gamma } = deps;
  const cfg: MultiLegHedgeConfig = { ...DEFAULT_CONFIG, ...deps.config };

  const positions: HedgePosition[] = [];
  const cooldowns = new Map<string, number>();

  const ctx: MultiLegHedgeTickContext = { positions, cooldowns, cfg, clob, orderManager, eventBus };

  // ── Main tick ──────────────────────────────────────────────────────────

  return async function multiLegHedgeTick(): Promise<void> {
    try {
      const events = await gamma.getEvents(20);

      await checkExitsFor(ctx, events);
      await scanEntriesFor(ctx, events);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
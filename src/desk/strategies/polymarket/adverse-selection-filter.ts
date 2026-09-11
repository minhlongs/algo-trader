/**
 * Adverse Selection Filter Strategy — V2 implementation.
 *
 * Filters out trades with high adverse selection risk by
 * analyzing order flow toxicity and information asymmetry.
 *
 * Exposes both a standalone scoring API and a tick function
 * for backward compatibility.
 */

import type { StrategyDeps } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import { DEFAULT_CONFIG } from './adverse-selection-types';
import { isAdverseSelection } from './adverse-selection-scoring';
import { AdverseSelectionFilter } from './adverse-selection-filter-class';

// ── Re-exports ─────────────────────────────────────────────────────────────────

export type { AdverseSelectionConfig, AdverseSelectionScore } from './adverse-selection-types';
export { DEFAULT_CONFIG } from './adverse-selection-types';
export {
  computeImbalanceStrength,
  computeSpreadScore,
  computeFadingScore,
  computeCompositeScore,
  isAdverseSelection,
} from './adverse-selection-scoring';
export { AdverseSelectionFilter } from './adverse-selection-filter-class';

// ── Tick factory (backward compat) ─────────────────────────────────────────────

export function createAdverseSelectionFilterTick(deps: StrategyDeps): () => Promise<void> {
  const filter = new AdverseSelectionFilter();

  return async () => {
    try {
      const markets = await deps.gamma.getTrending(10);
      let flaggedCount = 0;

      for (const market of markets) {
        if (!market.yesTokenId || market.closed || market.resolved) continue;

        try {
          const book = await deps.clob.getOrderBook(market.yesTokenId);
          const score = filter.analyze(book);

          if (isAdverseSelection(score, DEFAULT_CONFIG.threshold)) {
            flaggedCount++;
            logger.debug('Adverse selection flagged', 'AdverseSelectionFilter', {
              market: market.conditionId,
              compositeScore: score.composite,
              flags: score.flags,
            });
          }
        } catch {
          continue;
        }
      }

      logger.debug('Adverse selection scan complete', 'AdverseSelectionFilter', {
        marketsScanned: markets.length,
        adverseFlagged: flaggedCount,
      });
    } catch (err) {
      logger.error('Adverse selection tick failed', 'AdverseSelectionFilter', { err: String(err) });
    }
  };
}

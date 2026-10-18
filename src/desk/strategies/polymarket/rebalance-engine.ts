/**
 * Rebalance Engine — Threshold-Based Delta Rebalancing
 * Generates minimum set of RebalanceSignals to bring portfolio delta within bounds.
 *
 * Strategy: find the position with the largest deviation and hedge it first,
 * repeating until |netDelta| <= threshold or budget is exhausted.
 *
 * Used by: delta-neutral-volatility-arbitrage
 */

import {
  DeltaNeutralPortfolio,
  HedgePosition,
  RebalanceResult,
  RebalanceSignal,
} from '../../../shared/types/delta-neutral-types';
import { estimateHedgeSize } from './delta-calculator';

/** Maximum number of rebalance iterations to avoid infinite loops */
const MAX_REBALANCE_ITERATIONS = 10;

/** Determine if portfolio requires rebalancing. */
export function requiresRebalance(
  portfolio: DeltaNeutralPortfolio,
  threshold: number
): boolean {
  return Math.abs(portfolio.netDelta) > threshold;
}

/**
 * Generate minimum rebalance signals to bring |netDelta| below threshold.
 * Picks the position that most efficiently reduces delta at each step.
 */
export function computeRebalanceSignals(
  portfolio: DeltaNeutralPortfolio,
  threshold: number,
  maxLegSize: number
): RebalanceResult {
  const signals: RebalanceSignal[] = [];
  const deltaBefore = portfolio.netDelta;
  let remainingDelta = deltaBefore;
  const positions: HedgePosition[] = portfolio.positions.map((p) => ({ ...p }));

  for (let iter = 0; iter < MAX_REBALANCE_ITERATIONS; iter++) {
    if (Math.abs(remainingDelta) <= threshold) break;

    const signal = findBestRebalanceTrade(positions, remainingDelta, maxLegSize);
    if (!signal) break;

    signals.push(signal);

    const rawPrice = getPositionPrice(positions, signal.marketId, signal.side) ?? 0.5;
    const priceFactor = signal.side === 'NO' ? 1 - rawPrice : rawPrice;
    const deltaImpact = signal.size * ((priceFactor - 0.5) / 0.5);
    remainingDelta = signal.action === 'BUY' ? remainingDelta - deltaImpact : remainingDelta + deltaImpact;
  }

  return {
    signals,
    deltaBefore,
    deltaAfter: remainingDelta,
    estimatedCost: signals.reduce((sum, s) => sum + s.size, 0),
  };
}

/** Find the single best trade to reduce |remainingDelta|. */
function findBestRebalanceTrade(
  positions: HedgePosition[],
  remainingDelta: number,
  maxLegSize: number
): RebalanceSignal | null {
  let best: RebalanceSignal | null = null;
  let bestEfficiency = 0;

  for (const pos of positions) {
    const effectivePrice = pos.side === 'NO' ? 1 - pos.currentPrice : pos.currentPrice;
    const priceDev = (effectivePrice - 0.5) / 0.5;
    if (Math.abs(priceDev) < 1e-6) continue;

    const hedgeSize = estimateHedgeSize(
      remainingDelta,
      effectivePrice,
      Math.min(maxLegSize, pos.size)
    );
    if (hedgeSize < 1) continue;

    const efficiency = Math.abs(hedgeSize * priceDev) / hedgeSize;
    if (efficiency > bestEfficiency) {
      bestEfficiency = efficiency;
      const action: 'BUY' | 'SELL' = remainingDelta > 0 ? 'SELL' : 'BUY';
      best = {
        action,
        marketId: pos.marketId,
        side: pos.side,
        size: Math.round(hedgeSize * 100) / 100,
        reason: `Rebalance: delta=${remainingDelta.toFixed(4)}, efficiency=${efficiency.toFixed(4)}`,
      };
    }
  }

  return best;
}

function getPositionPrice(
  positions: HedgePosition[],
  marketId: string,
  side: 'YES' | 'NO'
): number | undefined {
  return positions.find((p) => p.marketId === marketId && p.side === side)?.currentPrice;
}

/**
 * Apply confirmed rebalance signals to update portfolio positions.
 * Adjusts sizes in-place based on BUY/SELL actions.
 */
export function applyRebalanceSignals(
  positions: HedgePosition[],
  signals: RebalanceSignal[]
): HedgePosition[] {
  const updated = positions.map((p) => ({ ...p }));

  for (const signal of signals) {
    const pos = updated.find((p) => p.marketId === signal.marketId && p.side === signal.side);
    if (!pos) continue;
    if (signal.action === 'BUY') {
      pos.size += signal.size;
    } else {
      pos.size = Math.max(0, pos.size - signal.size);
    }
  }

  return updated;
}

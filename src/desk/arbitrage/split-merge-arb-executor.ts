/**
 * Split-Merge Arbitrage Executor
 * Strategy: buy YES + NO on same binary market when sum < $1.00,
 * then merge both tokens on-chain for $1.00 guaranteed payout.
 * This is risk-free mathematical arbitrage — outcome doesn't matter.
 *
 * Polymarket fee: 2% on profit (charged at merge/settlement).
 * Profitable when: yesPrice + noPrice < 0.98 (i.e. spread > 2% fee)
 */

import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/create-message-bus';
import type { PaperTrade } from '../wiring/paper-trading-orchestrator';
import {
  type SplitMergeOpportunity,
  type GammaMarket,
  GAMMA_MARKETS_URL,
  POLY_FEE,
} from './split-merge-types';
import { scanSplitMergeArb } from './split-merge-scanner';

export type { SplitMergeOpportunity } from './split-merge-types';
export { scanSplitMergeArb } from './split-merge-scanner';

// ─── Paper trade simulation ───────────────────────────────────────────────────

/**
 * Simulate buying YES + NO simultaneously, then merging for $1.00.
 * Publishes to `signal.validated` so the paper-trading-orchestrator can track it.
 * This is RISK-FREE: the outcome is irrelevant — both tokens together equal $1.
 */
export async function executePaperSplitMerge(
  opportunity: SplitMergeOpportunity,
  sizeUsdc: number,
): Promise<PaperTrade> {
  // Shares acquired: sizeUsdc / totalCost per merged pair
  const pairs = sizeUsdc / opportunity.totalCost;
  const proceeds = pairs * 1.0;
  const fee = pairs * POLY_FEE;
  const netProfit = proceeds - fee - sizeUsdc;

  const trade: PaperTrade = {
    id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    marketId: opportunity.marketId,
    // Represent as YES (the merge combines both sides)
    side: 'YES',
    size: sizeUsdc,
    entryPrice: opportunity.totalCost,
    strategy: 'split-merge-arb',
    source: 'legacy',
    signalConfidence: 1.0,    // mathematical certainty
    swarmApproved: true,
    aiValidated: true,
    timestamp: Date.now(),
  };

  logger.info('[SplitMergeArb] Paper trade executed', {
    marketId: opportunity.marketId,
    totalCost: opportunity.totalCost.toFixed(4),
    profit: netProfit.toFixed(4),
    profitPct: opportunity.profitPercent.toFixed(2) + '%',
    size: sizeUsdc,
  });

  // Publish to signal pipeline so orchestrator logs it
  try {
    const bus = getMessageBus();
    if (bus.isConnected()) {
      await bus.publish('signal.validated', {
        original: {
          signalType: 'simple-arb',
          strategy: 'split-merge-arb',
          markets: [{
            id: opportunity.marketId,
            title: opportunity.title,
            yesPrice: opportunity.yesPrice,
            noPrice: opportunity.noPrice,
          }],
          expectedEdge: opportunity.profit,
          reasoning: `Split-merge arb: YES(${opportunity.yesPrice.toFixed(3)})+NO(${opportunity.noPrice.toFixed(3)})=${opportunity.totalCost.toFixed(3)} < 0.98. Net profit ${opportunity.profitPercent.toFixed(2)}% per pair.`,
        },
      }, 'split-merge-arb');
    }
  } catch (err) {
    logger.warn('[SplitMergeArb] Bus publish failed (non-critical)', { err: (err as Error).message });
  }

  return trade;
}

// ─── Fetch + scan entry point ─────────────────────────────────────────────────

/**
 * Fetch live markets from Gamma API and return all split-merge opportunities.
 * Designed to be called on a schedule (e.g. every 30s from an orchestrator).
 */
export async function fetchAndScanSplitMerge(): Promise<SplitMergeOpportunity[]> {
  logger.info('[SplitMergeArb] Scanning Gamma API for split-merge opportunities');

  try {
    const resp = await fetch(GAMMA_MARKETS_URL, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) throw new Error(`Gamma API ${resp.status}`);

    const raw = (await resp.json()) as GammaMarket[];
    const opps = scanSplitMergeArb(raw);

    logger.info('[SplitMergeArb] Scan complete', {
      marketsScanned: raw.length,
      opportunities: opps.length,
      topProfit: opps[0] ? opps[0].profitPercent.toFixed(2) + '%' : 'none',
    });

    return opps;
  } catch (err) {
    logger.error('[SplitMergeArb] Fetch failed', { err: (err as Error).message });
    return [];
  }
}

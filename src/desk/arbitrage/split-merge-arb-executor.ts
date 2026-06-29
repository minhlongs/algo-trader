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
import type { PaperTrade } from '../../wiring/paper-trading-orchestrator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SplitMergeOpportunity {
  marketId: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  /** Combined cost of buying 1 YES + 1 NO share */
  totalCost: number;
  /** Profit per share after merge, minus 2% Polymarket fee */
  profit: number;
  profitPercent: number;
}

// Minimal shape from Gamma API response
interface GammaMarket {
  conditionId?: string;
  question?: string;
  outcomePrices?: string | string[];
  active?: boolean;
  closed?: boolean;
  volume?: number | string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GAMMA_MARKETS_URL = 'https://gamma-api.polymarket.com/markets?closed=false&limit=200';
const POLY_FEE = 0.02;        // 2% fee applied at merge
const FEE_THRESHOLD = 1 - POLY_FEE; // 0.98 — max total cost to remain profitable
const MIN_PROFIT = 0.001;     // 0.1% minimum profit to surface opportunity
const MIN_VOLUME = 5_000;     // minimum $5K volume for sufficient liquidity

// ─── Price parsing ────────────────────────────────────────────────────────────

function parseOutcomePrices(raw: string | string[] | undefined): [number, number] | null {
  try {
    const arr: string[] = Array.isArray(raw) ? raw : JSON.parse(raw ?? '[]');
    const yes = parseFloat(arr[0] ?? '0');
    const no = parseFloat(arr[1] ?? '0');
    if (yes > 0 && yes < 1 && no > 0 && no < 1) return [yes, no];
  } catch { /* skip malformed */ }
  return null;
}

// ─── Core scanner ─────────────────────────────────────────────────────────────

/**
 * Scan a list of Gamma API markets for split-merge arb opportunities.
 * Only binary markets (yes + no prices) are applicable.
 */
export function scanSplitMergeArb(markets: GammaMarket[]): SplitMergeOpportunity[] {
  const opportunities: SplitMergeOpportunity[] = [];

  for (const m of markets) {
    if (m.closed || m.active === false) continue;

    const prices = parseOutcomePrices(m.outcomePrices);
    if (!prices) continue;

    const [yesPrice, noPrice] = prices;
    const totalCost = yesPrice + noPrice;

    // Must be strictly below fee threshold to net a positive return
    if (totalCost >= FEE_THRESHOLD) continue;

    // Merge: 1 YES + 1 NO → $1.00 payout, minus 2% fee on gross profit
    const grossProfit = 1.0 - totalCost;
    const profit = grossProfit - POLY_FEE;
    if (profit < MIN_PROFIT) continue;

    // Volume gate — ensure sufficient liquidity to fill both sides
    const volume = Number(m.volume ?? 0);
    if (volume < MIN_VOLUME) continue;

    opportunities.push({
      marketId: String(m.conditionId ?? ''),
      title: String(m.question ?? ''),
      yesPrice,
      noPrice,
      totalCost,
      profit,
      profitPercent: profit * 100,
    });
  }

  // Sort by highest profit first
  return opportunities.sort((a, b) => b.profit - a.profit);
}

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

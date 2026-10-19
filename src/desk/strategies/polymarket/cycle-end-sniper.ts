/**
 * Cycle-End Sniper Strategy
 * Times entries to the final 30-60 seconds before market resolution.
 * When a market price is already converging strongly toward one outcome (>95% or <5%),
 * entering in those last seconds means minimal exposure time and near-certain payout.
 *
 * Pipeline:
 *   1. Fetch markets from Gamma API
 *   2. Filter those resolving within the next 5 minutes
 *   3. Check if current price strongly predicts outcome (>0.95 or <0.05)
 *   4. Emit CycleEndSignal — consumed by paper-trading-orchestrator via signal.validated
 *
 * This is distinct from the "Endgame" path in paper-trading-orchestrator.ts:
 * the orchestrator's endgame checks long-duration high-probability markets;
 * this sniper targets only markets resolving in <5 min.
 */

import { logger } from '../../../shared/utils/logger';

import {
  type CycleEndSignal,
  type GammaMarket,
  GAMMA_MARKETS_URL,
  evaluateSnipeMarket,
  isInEntryWindow,
} from './cycle-end-sniper-math';

export { type CycleEndSignal, type GammaMarket, isInEntryWindow };

// ─── Core scanner ─────────────────────────────────────────────────────────────

/**
 * Scan a list of Gamma markets for cycle-end snipe opportunities.
 * Returns signals sorted by shortest time-to-resolution (most urgent first).
 */
export function scanCycleEndOpportunities(markets: GammaMarket[]): CycleEndSignal[] {
  const now = Date.now();
  const signals: CycleEndSignal[] = [];

  for (const m of markets) {
    const signal = evaluateSnipeMarket(m, now);
    if (signal) {
      signals.push(signal);
    }
  }

  // Prioritize: soonest resolving markets first (maximum price compression already done)
  return signals.sort((a, b) => a.timeToResolution - b.timeToResolution);
}

// ─── Fetch + scan entry point ─────────────────────────────────────────────────

/**
 * Fetch live markets from Gamma API and return cycle-end snipe signals.
 * Designed to be called frequently (every 10-30s) to catch short windows.
 */
export async function fetchAndScanCycleEnd(): Promise<CycleEndSignal[]> {
  logger.info('[CycleEndSniper] Scanning for markets resolving in <5 min');

  try {
    const resp = await fetch(GAMMA_MARKETS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error(`Gamma API ${resp.status}`);

    const raw = (await resp.json()) as GammaMarket[];
    const signals = scanCycleEndOpportunities(raw);

    if (signals.length > 0) {
      logger.info('[CycleEndSniper] Opportunities found', {
        count: signals.length,
        soonest: `${signals[0].timeToResolution}s`,
        topMarket: signals[0].title.slice(0, 50),
        predictedOutcome: signals[0].predictedOutcome,
        expectedProfit: (signals[0].expectedProfit * 100).toFixed(2) + '%',
      });
    } else {
      logger.debug('[CycleEndSniper] No opportunities in current window');
    }

    return signals;
  } catch (err) {
    logger.error('[CycleEndSniper] Fetch failed', { err: (err as Error).message });
    return [];
  }
}

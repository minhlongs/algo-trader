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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CycleEndSignal {
  marketId: string;
  title: string;
  currentYesPrice: number;
  predictedOutcome: 'YES' | 'NO';
  /** Derived from distance of price to certainty (1.0 or 0.0) */
  confidence: number;
  /** Seconds until market end date */
  timeToResolution: number;
  /** Estimated profit after 2% fee, per dollar wagered */
  expectedProfit: number;
}

// Gamma API market shape (minimal fields needed)
interface GammaMarket {
  conditionId?: string;
  question?: string;
  outcomePrices?: string | string[];
  endDate?: string | null;
  endDateIso?: string | null;
  active?: boolean;
  closed?: boolean;
  volume?: number | string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GAMMA_MARKETS_URL = 'https://gamma-api.polymarket.com/markets?closed=false&limit=200';
const POLY_FEE = 0.02;
const PRICE_CERTAINTY_THRESHOLD = 0.95;   // >95% YES or <5% YES = near-certain
const SNIPE_WINDOW_MS = 5 * 60 * 1000;    // only markets within 5 min of end
const ENTRY_WINDOW_MS = 60 * 1000;        // prefer final 60 seconds
const MIN_VOLUME = 10_000;                 // $10K minimum liquidity
const MIN_PROFIT = 0.005;                  // 0.5% minimum net profit

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseYesPrice(raw: string | string[] | undefined): number | null {
  try {
    const arr: string[] = Array.isArray(raw) ? raw : JSON.parse(raw ?? '[]');
    const yes = parseFloat(arr[0] ?? '');
    return isFinite(yes) && yes > 0 && yes < 1 ? yes : null;
  } catch { return null; }
}

function parseEndDateMs(market: GammaMarket): number | null {
  const raw = market.endDate ?? market.endDateIso;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return isNaN(ms) ? null : ms;
}

/** Compute confidence: how certain is the market that one side wins? */
function computeConfidence(yesPrice: number): number {
  // Price at 1.0 = 100% confidence YES, price at 0.0 = 100% confidence NO
  return yesPrice >= 0.5 ? yesPrice : 1 - yesPrice;
}

// ─── Core scanner ─────────────────────────────────────────────────────────────

/**
 * Scan a list of Gamma markets for cycle-end snipe opportunities.
 * Returns signals sorted by shortest time-to-resolution (most urgent first).
 */
export function scanCycleEndOpportunities(markets: GammaMarket[]): CycleEndSignal[] {
  const now = Date.now();
  const signals: CycleEndSignal[] = [];

  for (const m of markets) {
    if (m.closed || m.active === false) continue;

    const endMs = parseEndDateMs(m);
    if (!endMs) continue;

    const timeToResolutionMs = endMs - now;
    // Only within snipe window (next 5 min), and not already past end
    if (timeToResolutionMs <= 0 || timeToResolutionMs > SNIPE_WINDOW_MS) continue;

    const yesPrice = parseYesPrice(m.outcomePrices);
    if (yesPrice === null) continue;

    // Must be strongly trending toward one outcome
    if (yesPrice > PRICE_CERTAINTY_THRESHOLD) {
      // YES near-certain: buy YES, collect ~$1 at resolution
      const expectedProfit = (1 - yesPrice) - POLY_FEE;
      if (expectedProfit < MIN_PROFIT) continue;

      const volume = Number(m.volume ?? 0);
      if (volume < MIN_VOLUME) continue;

      signals.push({
        marketId: String(m.conditionId ?? ''),
        title: String(m.question ?? ''),
        currentYesPrice: yesPrice,
        predictedOutcome: 'YES',
        confidence: computeConfidence(yesPrice),
        timeToResolution: Math.floor(timeToResolutionMs / 1000),
        expectedProfit,
      });
    } else if (yesPrice < 1 - PRICE_CERTAINTY_THRESHOLD) {
      // NO near-certain: buy NO (price = 1-yesPrice), collect ~$1 at resolution
      const noPrice = 1 - yesPrice;
      const expectedProfit = (1 - noPrice) - POLY_FEE;
      if (expectedProfit < MIN_PROFIT) continue;

      const volume = Number(m.volume ?? 0);
      if (volume < MIN_VOLUME) continue;

      signals.push({
        marketId: String(m.conditionId ?? ''),
        title: String(m.question ?? ''),
        currentYesPrice: yesPrice,
        predictedOutcome: 'NO',
        confidence: computeConfidence(yesPrice),
        timeToResolution: Math.floor(timeToResolutionMs / 1000),
        expectedProfit,
      });
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

/**
 * Check if a signal is within the optimal entry window (final 60 seconds).
 * Use this to decide whether to act immediately or wait.
 */
export function isInEntryWindow(signal: CycleEndSignal): boolean {
  return signal.timeToResolution * 1000 <= ENTRY_WINDOW_MS;
}

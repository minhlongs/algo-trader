/**
 * Pure decay, urgency, and sniper math helpers for Cycle-End Sniper Strategy.
 */

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
export interface GammaMarket {
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

export const GAMMA_MARKETS_URL = 'https://gamma-api.polymarket.com/markets?closed=false&limit=200';
export const POLY_FEE = 0.02;
export const PRICE_CERTAINTY_THRESHOLD = 0.95;   // >95% YES or <5% YES = near-certain
export const SNIPE_WINDOW_MS = 5 * 60 * 1000;    // only markets within 5 min of end
export const ENTRY_WINDOW_MS = 60 * 1000;        // prefer final 60 seconds
export const MIN_VOLUME = 10_000;                 // $10K minimum liquidity
export const MIN_PROFIT = 0.005;                  // 0.5% minimum net profit

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parseYesPrice(raw: string | string[] | undefined): number | null {
  try {
    const arr: string[] = Array.isArray(raw) ? raw : JSON.parse(raw ?? '[]');
    const yes = parseFloat(arr[0] ?? '');
    return isFinite(yes) && yes > 0 && yes < 1 ? yes : null;
  } catch { return null; }
}

export function parseEndDateMs(market: GammaMarket): number | null {
  const raw = market.endDate ?? market.endDateIso;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return isNaN(ms) ? null : ms;
}

/** Compute confidence: how certain is the market that one side wins? */
export function computeConfidence(yesPrice: number): number {
  // Price at 1.0 = 100% confidence YES, price at 0.0 = 100% confidence NO
  return yesPrice >= 0.5 ? yesPrice : 1 - yesPrice;
}

/**
 * Evaluate a single Gamma market for a cycle-end snipe opportunity.
 */
export function evaluateSnipeMarket(m: GammaMarket, now: number): CycleEndSignal | null {
  if (m.closed || m.active === false) return null;

  const endMs = parseEndDateMs(m);
  if (!endMs) return null;

  const timeToResolutionMs = endMs - now;
  // Only within snipe window (next 5 min), and not already past end
  if (timeToResolutionMs <= 0 || timeToResolutionMs > SNIPE_WINDOW_MS) return null;

  const yesPrice = parseYesPrice(m.outcomePrices);
  if (yesPrice === null) return null;

  // Must be strongly trending toward one outcome
  if (yesPrice > PRICE_CERTAINTY_THRESHOLD) {
    // YES near-certain: buy YES, collect ~$1 at resolution
    const expectedProfit = (1 - yesPrice) - POLY_FEE;
    if (expectedProfit < MIN_PROFIT) return null;

    const volume = Number(m.volume ?? 0);
    if (volume < MIN_VOLUME) return null;

    return {
      marketId: String(m.conditionId ?? ''),
      title: String(m.question ?? ''),
      currentYesPrice: yesPrice,
      predictedOutcome: 'YES',
      confidence: computeConfidence(yesPrice),
      timeToResolution: Math.floor(timeToResolutionMs / 1000),
      expectedProfit,
    };
  }

  if (yesPrice < 1 - PRICE_CERTAINTY_THRESHOLD) {
    // NO near-certain: buy NO (price = 1-yesPrice), collect ~$1 at resolution
    const noPrice = 1 - yesPrice;
    const expectedProfit = (1 - noPrice) - POLY_FEE;
    if (expectedProfit < MIN_PROFIT) return null;

    const volume = Number(m.volume ?? 0);
    if (volume < MIN_VOLUME) return null;

    return {
      marketId: String(m.conditionId ?? ''),
      title: String(m.question ?? ''),
      currentYesPrice: yesPrice,
      predictedOutcome: 'NO',
      confidence: computeConfidence(yesPrice),
      timeToResolution: Math.floor(timeToResolutionMs / 1000),
      expectedProfit,
    };
  }

  return null;
}

/**
 * Check if a signal is within the optimal entry window (final 60 seconds).
 * Use this to decide whether to act immediately or wait.
 */
export function isInEntryWindow(signal: CycleEndSignal): boolean {
  return signal.timeToResolution * 1000 <= ENTRY_WINDOW_MS;
}

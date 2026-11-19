/**
 * Polymarket CLOB V2 fee category schedules and market-description classification.
 *
 * Two fee models coexist here:
 * - `FEE_SCHEDULES` is the legacy linear curve (March 2026): retained only for
 *   backwards-compatible backtests.
 * - `CLOB_V2_QUADRATIC_RATES` is a VERSIONED REFERENCE FALLBACK aligned with
 *   Polymarket's published fee table (`https://docs.polymarket.com/trading/fees`,
 *   effective 2026-11-20T23:59:00Z): `Fee = C * rate * p * (1 - p)` rounded to
 *   5 decimals (0.00001 pUSD minimum). Live runtime quoting MUST prefer venue
 *   market metadata via `src/desk/polymarket/clob-v2-fee-reconciler.ts`.
 */

export type PolymarketCategory =
  | 'crypto' | 'politics' | 'finance' | 'tech' | 'mentions'
  | 'economics' | 'culture' | 'weather' | 'other'
  | 'sports' | 'combos' | 'science' | 'pop_culture'
  | 'nfl_college_football' | 'table_tennis'
  | 'geopolitics' | 'world_events';

/** Canonical fallback category when market descriptions carry no stronger keyword match. */
export const DEFAULT_CLOB_V2_CATEGORY: PolymarketCategory = 'politics';

/** Version identifier for the static CLOB V2 reference fee table. */
export const CLOB_V2_FEE_SCHEDULE_VERSION = 'clob-v2-2026-11';

/** Effective timestamp (UTC ISO-8601) of the published CLOB V2 reference schedule. */
export const CLOB_V2_FEE_SCHEDULE_EFFECTIVE_AT_ISO = '2026-11-20T23:59:00Z';

/** Polymarket fee rounding precision: 5 decimal places (0.00001 pUSD minimum). */
export const CLOB_V2_FEE_DECIMALS = 5;
export const CLOB_V2_MIN_FEE_PUSD = 0.00001;
const CLOB_V2_FEE_SCALE = 10 ** CLOB_V2_FEE_DECIMALS;

/** Round fee/rebate in pUSD to 5 decimals; values `< 0.00001` round down to `0`. */
export function roundFeePusd(rawFeePusd: number): number {
  if (!Number.isFinite(rawFeePusd) || rawFeePusd <= 0) return 0;
  const rounded = Math.round((rawFeePusd + Number.EPSILON) * CLOB_V2_FEE_SCALE) / CLOB_V2_FEE_SCALE;
  return rounded < CLOB_V2_MIN_FEE_PUSD ? 0 : rounded;
}

/** Validate `price` in `(0, 1)` and exact integer multiple of `tickSize` (e.g. `0.01`, `0.001`). */
export function isPriceAlignedToTickSize(price: number, tickSize: number): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(tickSize) || tickSize <= 0 || tickSize > 0.5) return false;
  if (price <= 0 || price >= 1) return false;
  const steps = price / tickSize;
  return Math.abs(steps - Math.round(steps)) < 1e-8;
}

export interface FeeSchedule {
  /** Minimum taker fee (at probability near 50%), e.g. 0.0035 = 0.35% */
  minTakerFee: number;
  /** Maximum taker fee (at probability near 0% or 100%), e.g. 0.018 = 1.80% */
  maxTakerFee: number;
  /** Maker rebate as fraction of taker fees collected */
  makerRebatePct: number;
  /** True for exempt categories (no fees at all) */
  exempt: boolean;
}

/** CLOB V2 statutory base fee cap in basis points (1000 bps = 10.00%) */
export const CLOB_V2_MAX_BASE_FEE_BPS = 1000;

/**
 * Versioned reference fallback rates (docs.polymarket.com/trading/fees, Nov 2026).
 * Taker fee: `Fee = C * rCat * p * (1 - p)`; makers pay 0 and earn `makerRebatePct`
 * of collected taker fees when eligible. Runtime quoting must prefer live venue metadata.
 */
export const CLOB_V2_QUADRATIC_RATES: Record<PolymarketCategory, { rCat: number; makerRebatePct: number }> = {
  crypto:               { rCat: 0.07,  makerRebatePct: 0.20 },
  sports:               { rCat: 0.05,  makerRebatePct: 0.15 },
  nfl_college_football: { rCat: 0.03,  makerRebatePct: 0.15 },
  table_tennis:         { rCat: 0.10,  makerRebatePct: 0.15 },
  politics:             { rCat: 0.04,  makerRebatePct: 0.25 },
  finance:              { rCat: 0.04,  makerRebatePct: 0.25 },
  tech:                 { rCat: 0.04,  makerRebatePct: 0.25 },
  mentions:             { rCat: 0.04,  makerRebatePct: 0.25 },
  economics:            { rCat: 0.05,  makerRebatePct: 0.25 },
  culture:              { rCat: 0.05,  makerRebatePct: 0.25 },
  weather:              { rCat: 0.05,  makerRebatePct: 0.25 },
  other:                { rCat: 0.05,  makerRebatePct: 0.25 },
  combos:               { rCat: 0.05,  makerRebatePct: 0.00 },
  science:              { rCat: 0.04,  makerRebatePct: 0.20 },
  pop_culture:          { rCat: 0.05,  makerRebatePct: 0.25 },
  geopolitics:          { rCat: 0.00,  makerRebatePct: 0.00 },
  world_events:         { rCat: 0.00,  makerRebatePct: 0.00 },
};

/** Fee schedules per Polymarket category — effective March 30, 2026 (legacy curve) */
export const FEE_SCHEDULES: Record<PolymarketCategory, FeeSchedule> = {
  crypto:               { minTakerFee: 0.0035, maxTakerFee: 0.018,  makerRebatePct: 0.20, exempt: false },
  politics:             { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  finance:              { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.50, exempt: false },
  tech:                 { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  mentions:             { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  economics:            { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  culture:              { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  weather:              { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  other:                { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  sports:               { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.15, exempt: false },
  combos:               { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.00, exempt: false },
  nfl_college_football: { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.15, exempt: false },
  table_tennis:         { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.15, exempt: false },
  science:              { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.20, exempt: false },
  pop_culture:          { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.25, exempt: false },
  geopolitics:          { minTakerFee: 0,      maxTakerFee: 0,      makerRebatePct: 0,    exempt: true  },
  world_events:         { minTakerFee: 0,      maxTakerFee: 0,      makerRebatePct: 0,    exempt: true  },
};

const CATEGORY_KEYWORDS: Record<PolymarketCategory, string[]> = {
  crypto:       ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'token', 'defi', 'blockchain', 'solana', 'sol'],
  politics:     ['president', 'election', 'congress', 'senate', 'democrat', 'republican', 'vote', 'governor', 'trump', 'biden'],
  finance:      ['fed', 'interest rate', 'stock', 'sp500', 's&p', 'nasdaq', 'treasury', 'fomc'],
  tech:         ['ai', 'openai', 'apple', 'google', 'microsoft', 'nvidia', 'spacex', 'launch', 'chip'],
  mentions:     ['mention', 'say ', 'tweet', 'speech', 'press conference'],
  economics:    ['cpi', 'gdp', 'inflation', 'unemployment', 'recession', 'payroll', 'jobs report'],
  culture:      ['oscar', 'grammy', 'album', 'movie', 'netflix', 'show', 'concert', 'festival'],
  weather:      ['temperature', 'rainfall', 'snowfall', 'heatwave', 'forecast', 'degrees'],
  other:        ['miscellaneous', 'general'],
  sports:       ['nba', 'mlb', 'champion', 'playoff', 'world cup', 'finals', 'match'],
  combos:       ['parlay', 'combo', 'multi-leg'],
  nfl_college_football: ['nfl', 'ncaaf', 'college football', 'cfb', 'super bowl'],
  table_tennis: ['table tennis', 'ping pong', 'wtt', 'ittf'],
  science:      ['climate', 'nasa', 'mars', 'vaccine', 'cdc', 'pandemic', 'research', 'study'],
  pop_culture:  ['celebrity', 'kardashian', 'tiktok', 'instagram', 'viral', 'meme', 'influencer'],
  geopolitics:  ['war', 'nato', 'sanctions', 'ukraine', 'china', 'taiwan', 'ceasefire', 'un security'],
  world_events: ['earthquake', 'hurricane', 'tsunami', 'wildfire', 'disaster', 'famine'],
};

/** Classify a market description into a Polymarket fee category. */
export function classifyMarketCategory(description: string): PolymarketCategory {
  const lower = ` ${description.toLowerCase()} `;
  let bestCategory: PolymarketCategory = DEFAULT_CLOB_V2_CATEGORY;
  let bestScore = 0;

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [PolymarketCategory, string[]][]) {
    const score = keywords.filter((kw) =>
      kw.length <= 4 ? new RegExp(`\\b${kw}\\b`).test(lower) : lower.includes(kw),
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }
  return bestCategory;
}

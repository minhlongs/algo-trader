/**
 * Polymarket CLOB V2 fee category schedules and market-description classification.
 *
 * Extracted from `polymarket-fee-calculator.ts` so the category tables and the
 * keyword classifier live in their own module. Two fee models coexist here:
 *
 * - `FEE_SCHEDULES` is the legacy linear curve (March 2026): fee rises from a
 *   category floor toward a ceiling as the price moves away from 0.50. It is
 *   retained only for backwards-compatible backtests.
 * - `CLOB_V2_QUADRATIC_RATES` is the CLOB V2 engine (Nov 2026): a taker pays
 *   `Fee = C * r_cat * p * (1 - p)` in pUSD of shares, which peaks at p = 0.50
 *   and falls to zero at the extremes. This is the operative model.
 */

export type PolymarketCategory =
  | 'crypto' | 'politics' | 'finance' | 'tech'
  | 'culture' | 'sports' | 'science' | 'pop_culture'
  | 'nfl_college_football' | 'table_tennis'
  | 'geopolitics' | 'world_events';

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
 * CLOB V2 quadratic category rate r_cat: Fee = C * r_cat * p * (1 - p).
 *
 * `makerRebatePct` is the share of collected taker fees returned to makers.
 * `table_tennis`'s rebate is not stated as a percentage in the published fee
 * schedule ("category-defined"); 0.15 mirrors the sibling sports schedule and
 * only affects maker routing, never taker pricing.
 */
export const CLOB_V2_QUADRATIC_RATES: Record<PolymarketCategory, { rCat: number; makerRebatePct: number }> = {
  crypto:               { rCat: 0.07,  makerRebatePct: 0.20 },
  sports:               { rCat: 0.05,  makerRebatePct: 0.20 },
  nfl_college_football: { rCat: 0.03,  makerRebatePct: 0.15 },
  table_tennis:         { rCat: 0.10,  makerRebatePct: 0.15 },
  politics:             { rCat: 0.04,  makerRebatePct: 0.25 },
  finance:              { rCat: 0.04,  makerRebatePct: 0.25 },
  tech:                 { rCat: 0.04,  makerRebatePct: 0.20 },
  culture:              { rCat: 0.04,  makerRebatePct: 0.20 },
  science:              { rCat: 0.04,  makerRebatePct: 0.20 },
  pop_culture:          { rCat: 0.04,  makerRebatePct: 0.20 },
  geopolitics:          { rCat: 0.00,  makerRebatePct: 0.00 },
  world_events:         { rCat: 0.00,  makerRebatePct: 0.00 },
};

/** Fee schedules per Polymarket category — effective March 30, 2026 (legacy curve) */
export const FEE_SCHEDULES: Record<PolymarketCategory, FeeSchedule> = {
  crypto:               { minTakerFee: 0.0035, maxTakerFee: 0.018,  makerRebatePct: 0.20, exempt: false },
  politics:             { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  finance:              { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.50, exempt: false },
  tech:                 { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.20, exempt: false },
  culture:              { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.20, exempt: false },
  sports:               { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.20, exempt: false },
  nfl_college_football: { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.15, exempt: false },
  table_tennis:         { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.15, exempt: false },
  science:              { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.20, exempt: false },
  pop_culture:          { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.20, exempt: false },
  geopolitics:          { minTakerFee: 0,      maxTakerFee: 0,      makerRebatePct: 0,    exempt: true  },
  world_events:         { minTakerFee: 0,      maxTakerFee: 0,      makerRebatePct: 0,    exempt: true  },
};

/**
 * Keyword routes used by the highest-score-wins classifier. A keyword of four
 * characters or fewer must match on a word boundary, so short acronyms such as
 * `nfl` do not fire inside unrelated words; longer phrases match as substrings.
 */
const CATEGORY_KEYWORDS: Record<PolymarketCategory, string[]> = {
  crypto:       ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'token', 'defi', 'blockchain', 'solana', 'sol'],
  politics:     ['president', 'election', 'congress', 'senate', 'democrat', 'republican', 'vote', 'governor', 'trump', 'biden'],
  finance:      ['fed', 'interest rate', 'gdp', 'inflation', 'stock', 'sp500', 's&p', 'nasdaq', 'treasury', 'fomc'],
  tech:         ['ai', 'openai', 'apple', 'google', 'microsoft', 'nvidia', 'spacex', 'launch', 'chip'],
  culture:      ['oscar', 'grammy', 'album', 'movie', 'netflix', 'show', 'concert', 'festival'],
  // 'nfl' and 'super bowl' were moved to `nfl_college_football`, which is the
  // stricter schedule for those markets. The generic sports list still wins for
  // NBA/MLB/playoff-style questions that name no football league.
  sports:       ['nba', 'mlb', 'champion', 'playoff', 'world cup', 'finals', 'match'],
  nfl_college_football: ['nfl', 'ncaaf', 'college football', 'cfb', 'super bowl'],
  table_tennis: ['table tennis', 'ping pong', 'wtt', 'ittf'],
  science:      ['climate', 'nasa', 'mars', 'vaccine', 'cdc', 'pandemic', 'research', 'study'],
  pop_culture:  ['celebrity', 'kardashian', 'tiktok', 'instagram', 'viral', 'meme', 'influencer'],
  geopolitics:  ['war', 'nato', 'sanctions', 'ukraine', 'china', 'taiwan', 'ceasefire', 'un security'],
  world_events: ['earthquake', 'hurricane', 'tsunami', 'wildfire', 'disaster', 'famine'],
};

/** Classify a market description into a Polymarket fee category (defaults to 'politics'). */
export function classifyMarketCategory(description: string): PolymarketCategory {
  const lower = ` ${description.toLowerCase()} `;
  let bestCategory: PolymarketCategory = 'politics';
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

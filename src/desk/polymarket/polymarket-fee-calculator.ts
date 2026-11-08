// Polymarket dynamic fee calculator — March 30, 2026 & CLOB V2 Nov 2026 Quadratic Fee/Reward Engine
// Legacy calcTakerFee kept for backwards-compatible backtests; V2 quadratic functions match CLOB V2.

export type PolymarketCategory =
  | 'crypto' | 'politics' | 'finance' | 'tech'
  | 'culture' | 'sports' | 'science' | 'pop_culture'
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

/** CLOB V2 quadratic category rate r_cat: Fee = C * r_cat * p * (1 - p) */
export const CLOB_V2_QUADRATIC_RATES: Record<PolymarketCategory, { rCat: number; makerRebatePct: number }> = {
  crypto:       { rCat: 0.07, makerRebatePct: 0.20 },
  sports:       { rCat: 0.05, makerRebatePct: 0.20 },
  politics:     { rCat: 0.04, makerRebatePct: 0.25 },
  finance:      { rCat: 0.04, makerRebatePct: 0.25 },
  tech:         { rCat: 0.04, makerRebatePct: 0.20 },
  culture:      { rCat: 0.04, makerRebatePct: 0.20 },
  science:      { rCat: 0.04, makerRebatePct: 0.20 },
  pop_culture:  { rCat: 0.04, makerRebatePct: 0.20 },
  geopolitics:  { rCat: 0.00, makerRebatePct: 0.00 },
  world_events: { rCat: 0.00, makerRebatePct: 0.00 },
};

/** Fee schedules per Polymarket category — effective March 30, 2026 */
export const FEE_SCHEDULES: Record<PolymarketCategory, FeeSchedule> = {
  crypto:       { minTakerFee: 0.0035, maxTakerFee: 0.018,  makerRebatePct: 0.20, exempt: false },
  politics:     { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.25, exempt: false },
  finance:      { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.50, exempt: false },
  tech:         { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.20, exempt: false },
  culture:      { minTakerFee: 0.0020, maxTakerFee: 0.010,  makerRebatePct: 0.20, exempt: false },
  sports:       { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.20, exempt: false },
  science:      { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.20, exempt: false },
  pop_culture:  { minTakerFee: 0.0015, maxTakerFee: 0.0075, makerRebatePct: 0.20, exempt: false },
  geopolitics:  { minTakerFee: 0,      maxTakerFee: 0,      makerRebatePct: 0,    exempt: true  },
  world_events: { minTakerFee: 0,      maxTakerFee: 0,      makerRebatePct: 0,    exempt: true  },
};

/** Legacy linear fee estimator (kept for backwards-compatible backtest suite). */
export function calcTakerFee(category: PolymarketCategory, probability: number): number {
  const schedule = FEE_SCHEDULES[category];
  if (schedule.exempt) return 0;
  const distance = Math.abs(probability - 0.5);
  const ratio = Math.min(distance / 0.5, 1.0);
  return schedule.minTakerFee + (schedule.maxTakerFee - schedule.minTakerFee) * ratio;
}

/**
 * CLOB V2 quadratic taker fee rate per share: r_cat * p * (1 - p), capped at 10% (base_fee = 1000 bps).
 * Makers (`postOnly = true`) always pay 0%.
 */
export function calcQuadraticTakerFeeRateV2(
  category: PolymarketCategory,
  probability: number,
  postOnly = false,
): number {
  if (postOnly) return 0;
  const p = Math.max(0, Math.min(1, probability));
  const { rCat } = CLOB_V2_QUADRATIC_RATES[category];
  if (rCat <= 0) return 0;
  const rawRate = rCat * p * (1 - p);
  return Math.min(rawRate, CLOB_V2_MAX_BASE_FEE_BPS / 10_000);
}

/** CLOB V2 quadratic taker fee in pUSD for `contracts` shares at `probability` price. */
export function calcQuadraticTakerFeeV2(
  category: PolymarketCategory,
  probability: number,
  contracts: number,
  postOnly = false,
): number {
  if (postOnly || contracts <= 0) return 0;
  return contracts * calcQuadraticTakerFeeRateV2(category, probability, false);
}

/** CLOB V2 maker rebate in pUSD when a passive order is filled by a taker. */
export function calcMakerRebateV2(
  category: PolymarketCategory,
  probability: number,
  contracts: number,
): number {
  const takerFee = calcQuadraticTakerFeeV2(category, probability, contracts, false);
  return takerFee * CLOB_V2_QUADRATIC_RATES[category].makerRebatePct;
}

export interface LiquidityRewardScoreInput {
  maxIncentiveSpread: number;
  bidDistanceFromMid: number;
  askDistanceFromMid: number;
  bidSizeShares: number;
  askSizeShares: number;
  midProbability: number;
  inGameMultiplier?: number;
  singleSidedPenaltyDivisor?: number;
}

/**
 * CLOB V2 quadratic liquidity reward score S(v, s) = ((v - s) / v)^2 * b
 * with two-sided depth rule Q = max(min(Q_bid, Q_ask), max(Q_bid, Q_ask) / c) for p in [0.10, 0.90].
 */
export function calcLiquidityRewardScoreV2(input: LiquidityRewardScoreInput): {
  bidScorePerShare: number;
  askScorePerShare: number;
  effectiveWeightedScore: number;
} {
  const v = input.maxIncentiveSpread;
  const b = input.inGameMultiplier ?? 1.0;
  const c = input.singleSidedPenaltyDivisor ?? 3.0;
  if (v <= 0) return { bidScorePerShare: 0, askScorePerShare: 0, effectiveWeightedScore: 0 };

  const scoreAt = (s: number): number => {
    if (s < 0 || s >= v) return 0;
    const ratio = (v - s) / v;
    return ratio * ratio * b;
  };

  const bidScorePerShare = scoreAt(input.bidDistanceFromMid);
  const askScorePerShare = scoreAt(input.askDistanceFromMid);
  const qBid = Math.max(0, input.bidSizeShares) * bidScorePerShare;
  const qAsk = Math.max(0, input.askSizeShares) * askScorePerShare;
  const p = input.midProbability;

  const effectiveWeightedScore =
    p >= 0.10 && p <= 0.90
      ? Math.max(Math.min(qBid, qAsk), Math.max(qBid, qAsk) / c)
      : Math.min(qBid, qAsk);

  return { bidScorePerShare, askScorePerShare, effectiveWeightedScore };
}

/** Calculate maker rebate from taker fees collected. */
export function calcMakerRebate(category: PolymarketCategory, takerFeeCollected: number): number {
  return takerFeeCollected * FEE_SCHEDULES[category].makerRebatePct;
}

/** Total cost for a taker order including dynamic fee. */
export function netCostTaker(amount: number, category: PolymarketCategory, probability: number): number {
  return amount * (1 + calcTakerFee(category, probability));
}

/** Estimated net profit for a maker order including rebate. */
export function netProfitMaker(
  amount: number,
  category: PolymarketCategory,
  estimatedTakerVolume: number,
  probability = 0.5,
): number {
  const feeRate = calcTakerFee(category, probability);
  return amount + estimatedTakerVolume * feeRate * FEE_SCHEDULES[category].makerRebatePct;
}

const CATEGORY_KEYWORDS: Record<PolymarketCategory, string[]> = {
  crypto:       ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'token', 'defi', 'blockchain', 'solana', 'sol'],
  politics:     ['president', 'election', 'congress', 'senate', 'democrat', 'republican', 'vote', 'governor', 'trump', 'biden'],
  finance:      ['fed', 'interest rate', 'gdp', 'inflation', 'stock', 'sp500', 's&p', 'nasdaq', 'treasury', 'fomc'],
  tech:         ['ai', 'openai', 'apple', 'google', 'microsoft', 'nvidia', 'spacex', 'launch', 'chip'],
  culture:      ['oscar', 'grammy', 'album', 'movie', 'netflix', 'show', 'concert', 'festival'],
  sports:       ['nba', 'nfl', 'mlb', 'champion', 'playoff', 'world cup', 'super bowl', 'finals', 'match'],
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

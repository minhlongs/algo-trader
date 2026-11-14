/**
 * Primary-Source News-to-Probability Latency — parameter surface (Strategy 4).
 *
 * Pre-parsed primary-source arbitration check verified through two independent
 * classification streams plus an optional 3rd arbiter stream on split verdicts,
 * and optional sealed Market-Blind posterior ceiling integration (`p_post - theta`).
 *
 * `BaseStrategyConfig` fields stay last so callers override them unchanged.
 */

import type { StrategyName } from '../../../core/types';
import type { SealedForecastReceipt } from '../../../polymarket/market-blind/market-blind-types';
import type { BaseStrategyConfig } from '../base-polymarket-strategy';

/** One item off a primary-source feed, with the wire timestamp it carries. */
export interface Bulletin {
  /** Stable identity for dedupe. `url` when present, else host + title. */
  id: string;
  title: string;
  body: string;
  /** Host that published it — the whitelist check reads this. */
  sourceHost: string;
  /** Publication time on the wire, not the time this process saw it. */
  publishedAtMs: number;
  url?: string;
}

/** Deterministic market arbitration check compiled from resolution terms. */
export interface MarketCheck {
  key: string;
  requiredTerms: string[];
  forbiddenTerms: string[];
  requiredNumbers: Array<{ value: number; tolerance: number }>;
  allowedSourceHosts: string[];
}

/** What one classifier stream concluded about one bulletin. */
export interface NewsStreamVerdict {
  matches: boolean;
  /** 0–1 evidence coverage. The consensus gate reads this. */
  confidence: number;
  reason: string;
}

export type NewsClassifier = (
  bulletin: Bulletin,
  check: MarketCheck,
) => Promise<NewsStreamVerdict> | NewsStreamVerdict;

/** Two independent primary streams + optional 3rd arbiter on disagreement. */
export interface NewsStreams {
  term: NewsClassifier;
  numeric: NewsClassifier;
  arbiter?: NewsClassifier;
}

/** Compiles one event into its arbitration check, or null when impossible. */
export type ArbitrationCheckFn = (event: {
  id: string;
  title: string;
  slug: string;
}) => MarketCheck | null;

/** Sealed Market-Blind posterior supplied to cap Strategy 4 ladder entry price. */
export interface MarketBlindEventPosterior {
  receipt: SealedForecastReceipt;
  pPost: number;
  wSkill: number;
  thetaSafety?: number;
}

export type MarketBlindPosteriorEvaluator = (context: {
  event: { id: string; title: string; slug: string };
  bulletin: Bulletin;
  nowMs: number;
}) => Promise<MarketBlindEventPosterior | null> | MarketBlindEventPosterior | null;

export interface PrimarySourceNewsLatencyConfig extends BaseStrategyConfig {
  bulletinPollLimit: number;
  maxBulletinAgeMs: number;
  /** Streams (including arbiter tiebreak) must finish inside this window (800 ms). */
  dualVerifyWindowMs: number;
  /** Total wire-to-order latency allowed (2.5 s). */
  detectionBudgetMs: number;
  minStreamConfidence: number;
  /** Opt-in 3rd arbiter resolution when exactly one primary stream matches. */
  requireArbiterOnSplit: boolean;
  /** Alias for `requireArbiterOnSplit` when opting in arbiter tiebreak. */
  allowArbiterTiebreak?: boolean;
  /** Default safety margin `theta_safety` subtracted from `p_post(E)` when wired. */
  posteriorSafetyMarginPusd: number;
  eventScanLimit: number;
  minLadderLegs: number;
  maxLadderLegs: number;
  ladderMaxHorizonMs: number;
  maxEntryPricePusd: number;
  minEntryPricePusd: number;
  tickSize: number;
  clusterCapitalPusd: number;
  minClusterCapitalPusd: number;
  maxClusterCapitalPusd: number;
  legOrderType: 'IOC' | 'FOK';
  recycleFraction: number;
  recycleBandLowPusd: number;
  recycleBandHighPusd: number;
  holdToResolutionMaxWindowMs: number;
  shadowMode: boolean;
  shadowMinDetections: number;
  shadowMaxFalsePositiveRate: number;
  maxNtpOffsetMs: number;
}

export const DEFAULT_CONFIG: PrimarySourceNewsLatencyConfig = {
  bulletinPollLimit: 20,
  maxBulletinAgeMs: 10 * 60_000,
  dualVerifyWindowMs: 800,
  detectionBudgetMs: 2_500,
  minStreamConfidence: 1,
  requireArbiterOnSplit: false,
  posteriorSafetyMarginPusd: 0.03,
  eventScanLimit: 30,
  minLadderLegs: 1,
  maxLadderLegs: 20,
  ladderMaxHorizonMs: 30 * 24 * 60 * 60_000,
  maxEntryPricePusd: 0.97,
  minEntryPricePusd: 0.02,
  tickSize: 0.01,
  clusterCapitalPusd: 2_000,
  minClusterCapitalPusd: 1_000,
  maxClusterCapitalPusd: 15_000,
  legOrderType: 'IOC',
  recycleFraction: 0.7,
  recycleBandLowPusd: 0.94,
  recycleBandHighPusd: 0.97,
  holdToResolutionMaxWindowMs: 24 * 60 * 60_000,
  shadowMode: true,
  shadowMinDetections: 15,
  shadowMaxFalsePositiveRate: 0,
  maxNtpOffsetMs: 500,
  minVolume: 5_000,
  takeProfitPct: 10,
  stopLossPct: 0.9,
  maxHoldMs: 30 * 24 * 60 * 60_000,
  maxPositions: 6,
  cooldownMs: 60_000,
  positionSize: '2000',
};

export const STRATEGY_NAME: StrategyName = 'primary-source-news-latency';

/** One ladder contract, priced off its own ask book. */
export interface LadderLeg {
  tokenId: string;
  conditionId: string;
  outcome: string;
  askPrice: number;
  displayedShares: number;
  takerFeePerShare: number;
  expiryMs: number;
}

export interface LadderPlan {
  eventId: string;
  eventTitle: string;
  bulletinId: string;
  clusterCapitalPusd: number;
  legs: LadderLeg[];
}

/** One venue-confirmed fill. */
export interface NewsFill {
  tokenId: string;
  conditionId: string;
  outcome: string;
  price: number;
  quantity: number;
  fees: string | undefined;
  orderId: string;
  atMs: number;
}

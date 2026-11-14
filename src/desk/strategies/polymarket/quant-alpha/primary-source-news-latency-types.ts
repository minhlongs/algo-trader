/**
 * Primary-Source News-to-Probability Latency — parameter surface
 * (report: "Strategy 4").
 *
 * The strategy waits for a primary-source bulletin that satisfies a market's
 * pre-parsed arbitration terms, verifies it through two independent
 * classification streams, and only then sweeps the short-deadline ladder.
 * Every number the report pins lives here as a field: the 800 ms dual-stream
 * window, the 2.5 s detection budget, the p_max entry ceiling, the 0.94–0.97
 * recycling band, the 70/30 split, the 24 h hold window, the 15-event shadow
 * gate and the 500 ms clock-offset lock. Nothing is baked into the scan path.
 *
 * `BaseStrategyConfig` fields stay last so a caller overrides them unchanged.
 */

import type { StrategyName } from '../../../core/types';
import type { BaseStrategyConfig } from '../base-polymarket-strategy';

/** One item off a primary-source feed, with the wire timestamp it carries. */
export interface Bulletin {
  /** Stable identity for dedupe. `url` when present, else host + title. */
  id: string;
  title: string;
  body: string;
  /** Host that published it — the whitelist check reads exactly this. */
  sourceHost: string;
  /** Publication time on the wire, not the time this process saw it. */
  publishedAtMs: number;
  url?: string;
}

/**
 * One market compiled into a deterministic check, built offline from the
 * market's `resolutionSource` and arbitration terms because `GammaMarket`
 * carries neither. A check that cannot name its terms, numbers and allowed
 * hosts is not a check: the strategy declines to trade rather than guess.
 */
export interface MarketCheck {
  /** Identity of the compiled check, normally the event slug. */
  key: string;
  /** Every term the bulletin must contain, normalised. */
  requiredTerms: string[];
  /** Any term that disqualifies the bulletin (denials, retractions). */
  forbiddenTerms: string[];
  /** Numeric facts the bulletin must state, within tolerance. */
  requiredNumbers: Array<{ value: number; tolerance: number }>;
  /** Hosts allowed to publish a matching bulletin. */
  allowedSourceHosts: string[];
}

/** What one classifier stream concluded about one bulletin. */
export interface NewsStreamVerdict {
  matches: boolean;
  /** 0–1 evidence coverage. The consensus gate reads this. */
  confidence: number;
  reason: string;
}

/** The two independent streams the report cross-verifies. */
export interface NewsStreams {
  term: NewsClassifier;
  numeric: NewsClassifier;
}

export type NewsClassifier = (bulletin: Bulletin, check: MarketCheck) =>
  | Promise<NewsStreamVerdict>
  | NewsStreamVerdict;

/** Compiles one event into its arbitration check, or null when impossible. */
export type ArbitrationCheckFn = (event: {
  id: string;
  title: string;
  slug: string;
}) => MarketCheck | null;

export interface PrimarySourceNewsLatencyConfig extends BaseStrategyConfig {
  /** Bulletins kept from one poll, newest first. */
  bulletinPollLimit: number;
  /** Ignore a bulletin older than this at the moment it is seen. */
  maxBulletinAgeMs: number;
  /** Both classification streams must finish inside this window (report: 800 ms). */
  dualVerifyWindowMs: number;
  /** Total wire-to-order latency allowed (report: 2.5 s). */
  detectionBudgetMs: number;
  /** Minimum evidence coverage a stream needs to count as a match. */
  minStreamConfidence: number;
  /** How many events one scan asks Gamma for. */
  eventScanLimit: number;
  /** Smallest ladder that is worth sweeping. */
  minLadderLegs: number;
  /** Largest ladder that is worth sweeping. */
  maxLadderLegs: number;
  /** Only contracts resolving inside this horizon belong to the ladder. */
  ladderMaxHorizonMs: number;
  /** Entry ceiling p_max — the highest price the sweep will pay. */
  maxEntryPricePusd: number;
  /** Ladder legs priced below this are dust and are skipped. */
  minEntryPricePusd: number;
  /** Market price tick. No desk-layer API exposes it, so it is parameterised. */
  tickSize: number;
  /** Capital allocated across one event cluster. */
  clusterCapitalPusd: number;
  /** Report capacity envelope, lower bound. */
  minClusterCapitalPusd: number;
  /** Report capacity envelope, upper bound. */
  maxClusterCapitalPusd: number;
  /** Order type for the ladder sweep. The venue has no FAK; IOC is its enum. */
  legOrderType: 'IOC' | 'FOK';
  /** Fraction of each fill recycled early in the profit band (report: 0.70). */
  recycleFraction: number;
  /** Lower edge of the recycling band. */
  recycleBandLowPusd: number;
  /** Upper edge of the recycling band. */
  recycleBandHighPusd: number;
  /** Hold the remainder to resolution only when it resolves inside this window. */
  holdToResolutionMaxWindowMs: number;
  /** Observe and grade only; never place an order. */
  shadowMode: boolean;
  /** Detections the shadow gate requires before live use (report: 15). */
  shadowMinDetections: number;
  /** False-positive rate the shadow gate tolerates (report: 0.0). */
  shadowMaxFalsePositiveRate: number;
  /** Clock offset that hard-locks the module (report: 500 ms). */
  maxNtpOffsetMs: number;
}

export const DEFAULT_CONFIG: PrimarySourceNewsLatencyConfig = {
  bulletinPollLimit: 20,
  maxBulletinAgeMs: 10 * 60_000,
  dualVerifyWindowMs: 800,
  detectionBudgetMs: 2_500,
  minStreamConfidence: 1,
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
  // Base TP/SL are inert here: this strategy implements its own exits, so the
  // generic take-profit must never fire first inside the recycling band.
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
  /** Best ask, 0 when the side is empty — never a guess. */
  askPrice: number;
  /** Size resting exactly at `askPrice`. */
  displayedShares: number;
  /** Taker fee per share from the market's own schedule, 0 when exempt. */
  takerFeePerShare: number;
  /** Market expiry, so the exit path knows the resolution horizon. */
  expiryMs: number;
}

/** A whole event ladder the sweep will cross. */
export interface LadderPlan {
  eventId: string;
  eventTitle: string;
  bulletinId: string;
  /** Capital split evenly across `legs`. */
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

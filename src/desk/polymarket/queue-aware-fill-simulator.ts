/**
 * Queue-Aware Paper Fill Model
 *
 * The CLOB is a continuous limit order book, so the two order types fill for
 * different reasons and must not share one model:
 *
 *   - A resting (maker) order sits behind every share already quoted at its
 *     price. It trades only after that queue is consumed, and part of the
 *     visible queue cancels rather than trading, which shortens the wait.
 *   - A marketable (taker) order crosses the spread and sweeps the displayed
 *     depth. Queue position does not gate it; it pays the venue's matching
 *     delay instead, which is 150 ms on crypto-tier contracts.
 *
 * The three numbers the model is built on are the venue's published behaviour:
 *
 *   - 15–25% of the size resting at a level cancels instead of trading
 *   - cancel latency is log-normal with median 35 ms and p99 180 ms
 *   - crypto-tier takers wait 150 ms before the match
 *
 * Every constant below is pinned by a unit test; do not tune one without
 * updating the test that states the reason it exists.
 */

/** Share of visible size at a level that cancels before our order is reached. */
export const CANCEL_VOLUME_FRACTION_MIN = 0.15;
export const CANCEL_VOLUME_FRACTION_MAX = 0.25;

/** Median and 99th percentile of the venue's cancel latency, in milliseconds. */
export const CANCEL_LATENCY_MEDIAN_MS = 35;
export const CANCEL_LATENCY_P99_MS = 180;

/** Matching delay the venue applies to a taker on a crypto-tier contract. */
export const CRYPTO_TAKER_MATCH_DELAY_MS = 150;

/** z-score of the 99th percentile of the standard normal distribution. */
const NORMAL_P99_Z = 2.3263478740408408;

/**
 * Log-normal sigma that puts the p99 at 180 ms while the median stays at 35 ms:
 * `p99 = median * exp(sigma * z99)`, so `sigma = ln(180 / 35) / z99`.
 */
export const CANCEL_LATENCY_SIGMA =
  Math.log(CANCEL_LATENCY_P99_MS / CANCEL_LATENCY_MEDIAN_MS) / NORMAL_P99_Z;

export type RandomSource = () => number;

/** A book level exactly as the CLOB delivers it — decimal strings. */
export interface FillBookLevel {
  price: string;
  size: string;
}

export interface QueueModel {
  /** Expected share of visible size at a level that cancels instead of trading. */
  cancelVolumeFraction: number;
  /** Sampled latency available to pull a resting order. */
  cancelLatencyMs: number;
  /** Matching delay the venue applies before a taker fill is final. */
  takerMatchDelayMs: number;
}

/** Mulberry32: seedable and deterministic, which the fill model must be to replay. */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** One standard normal draw via Box–Muller; the second draw is discarded. */
function sampleStandardNormal(rng: RandomSource): number {
  const uniform = Math.max(rng(), Number.EPSILON);
  const v = rng();
  return Math.sqrt(-2 * Math.log(uniform)) * Math.cos(2 * Math.PI * v);
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Cancel latency in milliseconds, log-normal with median 35 ms and p99 180 ms. */
export function sampleCancelLatencyMs(rng: RandomSource = Math.random): number {
  return CANCEL_LATENCY_MEDIAN_MS * Math.exp(CANCEL_LATENCY_SIGMA * sampleStandardNormal(rng));
}

/** Share of a level's visible size that cancels, drawn from the 15–25% band. */
export function sampleCancelVolumeFraction(rng: RandomSource = Math.random): number {
  const u = clampUnit(rng());
  return CANCEL_VOLUME_FRACTION_MIN + u * (CANCEL_VOLUME_FRACTION_MAX - CANCEL_VOLUME_FRACTION_MIN);
}

/** Matching delay the venue applies to a taker on a contract of `tier`. */
export function takerMatchDelayMsForTier(tier: 'crypto' | 'standard'): number {
  return tier === 'crypto' ? CRYPTO_TAKER_MATCH_DELAY_MS : 0;
}

/** Build one model draw for an order, so a replay of the same seed fills the same way. */
export function buildQueueModel(
  params: { tier?: 'crypto' | 'standard'; rng?: RandomSource } = {},
): QueueModel {
  const rng = params.rng ?? Math.random;
  return {
    cancelVolumeFraction: sampleCancelVolumeFraction(rng),
    cancelLatencyMs: sampleCancelLatencyMs(rng),
    takerMatchDelayMs: takerMatchDelayMsForTier(params.tier ?? 'standard'),
  };
}

export interface MakerQueueEstimate {
  /** Size resting at our price before our order joined the queue. */
  queueAheadSize: number;
  /** The share of that size expected to cancel rather than trade. */
  cancelVolumeFraction: number;
  /** What we still wait behind once the cancellations land. */
  effectiveQueueAheadSize: number;
  /** Latency available to pull the order before the queue reach us. */
  cancelLatencyMs: number;
}

/**
 * Queue position for a resting order at `limitPrice`: everything already quoted
 * at that price is ahead of us, minus the part that cancels.
 */
export function estimateMakerQueue(params: {
  levels: FillBookLevel[];
  limitPrice: number;
  cancelVolumeFraction: number;
  cancelLatencyMs: number;
}): MakerQueueEstimate {
  const level = params.levels
    .map((lvl) => ({ price: Number(lvl.price), size: Number(lvl.size) }))
    .filter((lvl) => Number.isFinite(lvl.price) && Number.isFinite(lvl.size) && lvl.size > 0)
    .find((lvl) => Math.abs(lvl.price - params.limitPrice) <= 1e-9);

  const queueAheadSize = level ? level.size : 0;
  const fraction = clampUnit(params.cancelVolumeFraction);
  const cancelLatencyMs = Number.isFinite(params.cancelLatencyMs) ? params.cancelLatencyMs : 0;
  return {
    queueAheadSize,
    cancelVolumeFraction: fraction,
    effectiveQueueAheadSize: queueAheadSize * (1 - fraction),
    cancelLatencyMs: Math.max(0, cancelLatencyMs),
  };
}

export interface MakerFillOutcome {
  filledSize: number;
  /** False while our order is still behind the queue. */
  queueReached: boolean;
  queueAheadSize: number;
  effectiveQueueAheadSize: number;
  /** Aggressive size that arrived at our price during the cancel window. */
  arrivedDuringCancelWindow: number;
}

/**
 * Back-of-queue fill for a resting order. Aggressive flow keeps arriving until
 * our cancel lands, so the volume we face is the arrival rate times the sampled
 * cancel latency; we trade only the part of it that clears the queue ahead.
 */
export function simulateMakerFill(params: {
  ourSize: number;
  queue: MakerQueueEstimate;
  /** Aggressive volume arriving at our price, in shares per millisecond. */
  aggressiveVolumePerMs: number;
}): MakerFillOutcome {
  const ourSize = Math.max(0, params.ourSize);
  const arrivalRate = Math.max(0, params.aggressiveVolumePerMs);
  const arrived = arrivalRate * params.queue.cancelLatencyMs;
  const clearable = arrived - params.queue.effectiveQueueAheadSize;
  const queueReached = clearable > 0;
  return {
    filledSize: queueReached ? Math.min(ourSize, clearable) : 0,
    queueReached,
    queueAheadSize: params.queue.queueAheadSize,
    effectiveQueueAheadSize: params.queue.effectiveQueueAheadSize,
    arrivedDuringCancelWindow: arrived,
  };
}

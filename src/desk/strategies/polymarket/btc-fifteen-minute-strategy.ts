/**
 * BTC 15-Minute Price Prediction Strategy for Polymarket.
 *
 * Targets markets asking "Will BTC be above $X in 15 minutes?"
 * Uses 3 pure-math signals (no LLM) fused via signal-fusion-engine:
 *   1. Momentum   — % price change over last 5 candles (1m interval)
 *   2. Volatility — stddev of 1m close prices over last 15 candles
 *   3. Mean reversion — distance from 15-candle VWAP (normalized)
 *
 * Data source: Binance public klines API (no auth, no rate limit key).
 * Entry point: analyzeBtcFifteenMinute() → BtcSignal
 */

import { logger } from '../../core/logger';
import { fuseSignals, type SignalInput } from '../../intelligence/signal-fusion-engine';

// ── Public interface ──────────────────────────────────────────────────────────

export interface BtcSignal {
  direction: 'UP' | 'DOWN' | 'NEUTRAL';
  /** 0-1 fusion confidence */
  confidence: number;
  /** Individual signal scores keyed by name (-1 to +1) */
  signals: Record<string, number>;
  timestamp: number;
}

// ── Binance kline response shape ──────────────────────────────────────────────

/** Binance kline tuple: [openTime, open, high, low, close, volume, ...] */
type BinanceKline = [
  number,  // 0: open time
  string,  // 1: open
  string,  // 2: high
  string,  // 3: low
  string,  // 4: close
  string,  // 5: volume
  ...unknown[]
];

// ── API constants ─────────────────────────────────────────────────────────────

const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines';
const SYMBOL = 'BTCUSDT';
const INTERVAL = '1m';
/** Fetch 16 candles: 15 closed + 1 current (we use only closed) */
const LIMIT = 16;
const FETCH_TIMEOUT_MS = 8_000;

// ── Signal config — tune these to adjust sensitivity ─────────────────────────

/** How many recent candles define "momentum" */
const MOMENTUM_WINDOW = 5;
/** Initial equal weights — updated externally via updateWeights() */
const DEFAULT_WEIGHTS: Record<string, number> = {
  momentum: 0.4,
  volatility: 0.3,
  'mean-reversion': 0.3,
};
/** Volatility normalization reference (1% stddev = score 0) */
const VOL_NEUTRAL_PCT = 0.01;
/** Mean reversion normalization: distance > this % = max score */
const REVERSION_MAX_PCT = 0.005;

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchBinanceKlines(): Promise<BinanceKline[]> {
  const url = `${BINANCE_KLINES_URL}?symbol=${SYMBOL}&interval=${INTERVAL}&limit=${LIMIT}`;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'Accept': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`Binance klines HTTP ${resp.status}`);
  }

  return resp.json() as Promise<BinanceKline[]>;
}

// ── Signal computation ────────────────────────────────────────────────────────

/** Extract close prices from klines (all except the last, incomplete candle) */
function extractCloses(klines: BinanceKline[]): number[] {
  // Exclude last candle (still open); use the 15 closed ones
  return klines.slice(0, -1).map(k => parseFloat(k[4]));
}

/** Extract volume from klines (parallel to closes) */
function extractVolumes(klines: BinanceKline[]): number[] {
  return klines.slice(0, -1).map(k => parseFloat(k[5]));
}

/**
 * Momentum signal: returns score in [-1, +1].
 * Positive = price rising, negative = falling.
 * Normalized by the momentum window length to avoid magnitude explosion.
 */
function computeMomentum(closes: number[]): number {
  if (closes.length < MOMENTUM_WINDOW + 1) return 0;
  const recent = closes[closes.length - 1];
  const baseline = closes[closes.length - 1 - MOMENTUM_WINDOW];
  if (baseline === 0) return 0;

  const pctChange = (recent - baseline) / baseline;
  // Normalize: +/-2% move = +/-1 score (clamp to [-1, +1])
  return Math.max(-1, Math.min(1, pctChange / 0.02));
}

/**
 * Volatility signal: returns score in [-1, +1].
 * High volatility → positive score (favors breakout / directional trade).
 * Low volatility → negative score (mean-reverting conditions, avoid).
 * Normalized relative to VOL_NEUTRAL_PCT.
 */
function computeVolatility(closes: number[]): number {
  if (closes.length < 2) return 0;

  const mean = closes.reduce((s, c) => s + c, 0) / closes.length;
  const variance = closes.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / closes.length;
  const stddev = Math.sqrt(variance);
  const stddevPct = mean > 0 ? stddev / mean : 0;

  // Normalize: stddev at VOL_NEUTRAL_PCT → score 0; double → score +1
  const raw = (stddevPct - VOL_NEUTRAL_PCT) / VOL_NEUTRAL_PCT;
  return Math.max(-1, Math.min(1, raw));
}

/**
 * Mean reversion signal: returns score in [-1, +1].
 * Negative (below VWAP) → expects UP (positive score).
 * Positive (above VWAP) → expects DOWN (negative score).
 * Uses volume-weighted average price over the candle window.
 */
function computeMeanReversion(closes: number[], volumes: number[]): number {
  if (closes.length === 0 || closes.length !== volumes.length) return 0;

  const totalVol = volumes.reduce((s, v) => s + v, 0);
  if (totalVol === 0) {
    // Fallback to simple average if no volume data
    const avg = closes.reduce((s, c) => s + c, 0) / closes.length;
    const last = closes[closes.length - 1];
    const dist = (avg - last) / avg;
    return Math.max(-1, Math.min(1, dist / REVERSION_MAX_PCT));
  }

  const vwap = closes.reduce((s, c, i) => s + c * volumes[i], 0) / totalVol;
  const last = closes[closes.length - 1];
  // Positive dist = price below VWAP → expect reversion UP
  const dist = (vwap - last) / vwap;
  return Math.max(-1, Math.min(1, dist / REVERSION_MAX_PCT));
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Analyze BTC price using 3 mathematical signals + fusion engine.
 * Returns BtcSignal. Throws on Binance API failure — callers must catch.
 */
export async function analyzeBtcFifteenMinute(): Promise<BtcSignal> {
  const klines = await fetchBinanceKlines();

  logger.debug('[BtcStrategy] Fetched klines', { count: klines.length });

  const closes = extractCloses(klines);
  const volumes = extractVolumes(klines);

  const momentumScore = computeMomentum(closes);
  const volatilityScore = computeVolatility(closes);
  const reversionScore = computeMeanReversion(closes, volumes);

  const signalInputs: SignalInput[] = [
    { name: 'momentum', score: momentumScore, weight: DEFAULT_WEIGHTS.momentum },
    { name: 'volatility', score: volatilityScore, weight: DEFAULT_WEIGHTS.volatility },
    { name: 'mean-reversion', score: reversionScore, weight: DEFAULT_WEIGHTS['mean-reversion'] },
  ];

  const fusion = fuseSignals(signalInputs);

  logger.info('[BtcStrategy] Analysis complete', {
    direction: fusion.direction,
    confidence: fusion.confidence,
    weightedScore: fusion.weightedScore,
    momentum: momentumScore,
    volatility: volatilityScore,
    meanReversion: reversionScore,
  });

  return {
    direction: fusion.direction,
    confidence: fusion.confidence,
    signals: {
      momentum: momentumScore,
      volatility: volatilityScore,
      'mean-reversion': reversionScore,
    },
    timestamp: Date.now(),
  };
}

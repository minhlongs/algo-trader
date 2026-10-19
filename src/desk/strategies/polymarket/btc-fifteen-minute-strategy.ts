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
import {
  extractCloses,
  extractVolumes,
  computeMomentum,
  computeVolatility,
  computeMeanReversion,
} from './btc-signals-math';

export {
  extractCloses,
  extractVolumes,
  computeMomentum,
  computeVolatility,
  computeMeanReversion,
};

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
export type BinanceKline = [
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

const DEFAULT_WEIGHTS: Record<string, number> = {
  momentum: 0.4,
  volatility: 0.3,
  'mean-reversion': 0.3,
};

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

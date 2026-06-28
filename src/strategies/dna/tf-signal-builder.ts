/**
 * Per-TF Signal Builder
 *
 * Takes TimeframeIndicators for a single TF + MicroStructureIndicators and
 * produces a TfSignal (bull / bear / neutral + confidence).
 *
 * Rules are explicit policy-as-code — no hidden thresholds in the consensus
 * layer. Every TF produces exactly one TfSignal regardless of how mixed the
 * indicators look.
 *
 * Cheetahclaws-DNA:
 *  - Legibility  : TfSignal.reason is a concatenation of indicator verdicts,
 *                  e.g. "trend=up ADX=32 RSI=65 BB=wide OBI=bid-heavy".
 *  - Explicitness: all thresholds are named constants below.
 *  - Tractability: output is a pure record with `emittedAt`; every run can be
 *                  re-derived from indicators alone.
 */

import {
  TimeframeIndicators,
  TfSignal,
  TfSignalAction,
  TfId,
} from './multi-tf-types.js';
import { computeTrendIndicators, trendDirectionScore } from './indicators-trend.js';
import { computeMomentumIndicators, momentumDirection } from './indicators-momentum.js';
import { computeVolatilityIndicators } from './indicators-volatility.js';
import { computeMicroIndicators, isMicroTf } from './indicators-microstructure.js';

// ─── Thresholds (explicit policy) ─────────────────────────────────────────────

const TREND_CONFIDENCE_HIGH = 0.70;
const TREND_CONFIDENCE_MID = 0.50;

const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;

const MACD_HIST_POSITIVE_THRESHOLD = 0;

const OBI_BID_HEAVY = 0.20;   // obi > 0.2 → bid-heavy
const OBI_ASK_HEAVY = -0.20;  // obi < -0.2 → ask-heavy

// ─── Direction score → confidence mapping ─────────────────────────────────────

function scoreToConfidence(score: number, adx: number): number {
  // adx scales confidence: strong ADX (>30) amplifies score; weak ADX (<20) dampens.
  const adxScale = Math.min(adx / 30, 1);
  const raw = (score + 1) / 2; // map [-1,1] → [0,1]
  return Math.round(raw * 0.7 + adxScale * 0.3);
}

function actionFromScore(score: number): TfSignalAction {
  if (score > 0.15) return 'bull';
  if (score < -0.15) return 'bear';
  return 'neutral';
}

function buildReason(
  tf: TfId,
  trend: TimeframeIndicators['trend'],
  momentum: TimeframeIndicators['momentum'],
  volatility: TimeframeIndicators['volatility'],
  micro: TimeframeIndicators['microstructure'],
  action: TfSignalAction,
  score: number,
): string {
  const parts: string[] = [
    `tf=${tf}`,
    `trend=${trend.adxTrend}`,
    `ADX=${trend.adx}`,
    `RSI=${momentum.rsi}`,
    `MACDhist=${momentum.macdHist}`,
    `BBw=${volatility.bollingerWidthPct.toFixed(1)}%`,
  ];
  if (micro.obi !== null) {
    parts.push(`OBI=${micro.obi >= 0 ? '+' : ''}${micro.obi.toFixed(2)}`);
  }
  parts.push(`→ ${action.toUpperCase()} (score=${score.toFixed(2)})`);
  return parts.join(' | ');
}

// ─── Public: build a single TfSignal ─────────────────────────────────────────

export function buildTfSignal(
  tf: TfId,
  candles: TimeframeIndicators['candles'],
  bidVol: number = 0,
  askVol: number = 0,
  now: number = Date.now(),
): TfSignal {
  const trend = computeTrendIndicators(tf, candles);
  const momentum = computeMomentumIndicators(tf, candles);
  const volatility = computeVolatilityIndicators(tf, candles);
  const microstructure = computeMicroIndicators(tf, candles, bidVol, askVol);

  const trendScore = trendDirectionScore(trend);
  const momScore = momentumDirection(momentum);
  const microScore = (() => {
    const obi = microstructure.obi;
    if (obi === null) return 0;
    if (obi > OBI_BID_HEAVY) return 0.3;
    if (obi < OBI_ASK_HEAVY) return -0.3;
    return 0;
  })();

  const compositeScore = trendScore * 0.5 + momScore * 0.35 + microScore * 0.15;
  const action = actionFromScore(compositeScore);
  const confidence = scoreToConfidence(compositeScore, trend.adx);

  return {
    tf,
    action,
    confidence,
    entryHint: null,
    slHint: null,
    tpHint: null,
    reason: buildReason(tf, trend, momentum, volatility, microstructure, action, compositeScore),
    indicatorSnap: { trend, momentum, volatility },
    emittedAt: now,
  };
}

/**
 * Convenience: build TfSignal from a pre-computed TimeframeIndicators (so the
 * caller can cache indicator computation and only re-build the signal).
 */
export function buildTfSignalFromIndicators(
  tf: TfId,
  indicators: TimeframeIndicators,
  now: number = Date.now(),
): TfSignal {
  const { trend, momentum, volatility } = indicators;
  const trendScore = trendDirectionScore(trend);
  const momScore = momentumDirection(momentum);
  const microScore = (() => {
    const obi = indicators.microstructure.obi;
    if (obi === null) return 0;
    if (obi > OBI_BID_HEAVY) return 0.3;
    if (obi < OBI_ASK_HEAVY) return -0.3;
    return 0;
  })();
  const compositeScore = trendScore * 0.5 + momScore * 0.35 + microScore * 0.15;
  const action = actionFromScore(compositeScore);
  const confidence = scoreToConfidence(compositeScore, trend.adx);
  return {
    tf,
    action,
    confidence,
    entryHint: null,
    slHint: null,
    tpHint: null,
    reason: buildReason(tf, trend, momentum, volatility, indicators.microstructure, action, compositeScore),
    indicatorSnap: { trend, momentum, volatility },
    emittedAt: now,
  };
}

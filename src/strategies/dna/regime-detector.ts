/**
 * Regime Detector — DNA context layer
 *
 * Classifies market into trending_up | trending_down | ranging | volatile
 * using multi-TF trend stack + ATR%.
 *
 * The regime is a *soft constraint*, not a hard gate:
 *  - trending_up regime  → long bias (consensus must still pass thresholds)
 *  - trending_down       → short bias
 *  - ranging / volatile  → no directional bias; confidence threshold rises
 *
 * Cheetahclaws-DNA:
 *  - Legibility  : reason string explains which TFs drove the regime call.
 *  - Explicitness: regime thresholds are named constants.
 *  - Tractability: RegimeSnapshot has validFrom/validUntil so stale regime can
 *                  be detected at journal-replay time.
 */

import {
  TimeframeIndicators,
  MarketRegime,
  RegimeSnapshot,
  TfId,
  TF_RESOLUTIONS,
} from './multi-tf-types.js';
import { computeTrendIndicators } from './indicators-trend.js';

// ─── Regime thresholds ────────────────────────────────────────────────────────

const ADX_TRENDING_THRESHOLD = 25;
const ATR_PCT_VOLATILE = 0.04;  // ATR% > 4% → volatile
const ATR_PCT_NORMAL = 0.02;

function classifyTf(tf: TfId, indicators: TimeframeIndicators): MarketRegime {
  const { adx, adxTrend } = indicators.trend;
  const atrPct = indicators.volatility.atrPct;
  if (atrPct >= ATR_PCT_VOLATILE * 100) return 'volatile';
  if (adx < ADX_TRENDING_THRESHOLD) return 'ranging';
  return adxTrend === 'up' ? 'trending_up' : 'trending_down';
}

function dominantTf(indicatorsByTf: Map<TfId, TimeframeIndicators>): TfId {
  // The TF with the highest ADX is assumed to lead the regime.
  let best: { tf: TfId; adx: number } = { tf: '1d', adx: -Infinity };
  for (const [tf, ind] of indicatorsByTf) {
    if (ind.trend.adx > best.adx) best = { tf, adx: ind.trend.adx };
  }
  return best.tf;
}

function buildReason(
  regime: MarketRegime,
  indicatorsByTf: Map<TfId, TimeframeIndicators>,
  dominant: TfId,
): string {
  const perTf: string[] = [];
  for (const [tf, ind] of indicatorsByTf) {
    perTf.push(`${tf}=${classifyTf(tf, ind)} (ADX=${ind.trend.adx})`);
  }
  return `regime=${regime} dominant=${dominant} | ${perTf.join(', ')}`;
}

/**
 * Compute regime snapshot from a set of computed TimeframeIndicators.
 * `now` is the epoch-ms at which the regime is being evaluated.
 */
export function detectRegime(
  indicatorsByTf: Map<TfId, TimeframeIndicators>,
  now: number,
  ttlMs: number = TF_RESOLUTIONS['1h'] * 2, // regime valid for 2h by default
): RegimeSnapshot {
  const dominant = dominantTf(indicatorsByTf);
  const dominantInd = indicatorsByTf.get(dominant);
  const regime = dominantInd ? classifyTf(dominant, dominantInd) : 'ranging';
  // Confidence = how many TFs agree with dominant classification
  let agreeCount = 0;
  for (const [, ind] of indicatorsByTf) {
    if (classifyTf(dominant, ind) === regime) agreeCount++;
  }
  const confidence = Math.round((agreeCount / indicatorsByTf.size) * 100) / 100;
  return {
    regime,
    regimeConfidence: confidence,
    dominantTf: dominant,
    reason: buildReason(regime, indicatorsByTf, dominant),
    validFrom: now,
    validUntil: now + ttlMs,
  };
}

/**
 * Convenience: refresh a RegimeSnapshot's validity window (called on every
 * tick to indicate whether the cached snapshot is still fresh).
 */
export function isRegimeFresh(snapshot: RegimeSnapshot, now: number): boolean {
  if (snapshot.validUntil === null) return true;
  return now < snapshot.validUntil;
}

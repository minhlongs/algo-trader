/**
 * Consensus Engine
 *
 * Fuses per-TF signals into a single ConsensusSignal.
 * Uses weighted scoring + minimum-agreement gate + regime-aware confidence
 * adjustment.
 *
 * Weight distribution (explicit, config-overridable):
 *   1d   0.30   — trend anchor (highest weight: least noise)
 *   4h   0.25   — structural direction
 *   1h   0.20   — intermediate confirmation
 *   15m  0.15   — timing layer
 *   5m   0.07   — fine entry timing
 *   1m   0.03   — microstructure noise filter (smallest weight)
 *
 * Decision rules (hard-coded policy — explicitness):
 *   Action:
 *     weightedBullScore - weightedBearScore >= consensusSpread  → enter_long
 *     weightedBearScore - weightedBullScore >= consensusSpread  → enter_short
 *     otherwise                                              → hold
 *   Confidence gate:
 *     max(weightedBullScore, weightedBearScore) >= minConsensusConfidence
 *   Agreement gate:
 *     count(TF where action matches winning direction) >= minTfAgreement
 *   Volatility gate:
 *     max(ATR%) across active TFs <= maxAtpPct
 *
 * Cheetahclaws-DNA:
 *  - Legibility  : every ConsensusSignal carries full tfSignals[] breakdown +
 *                  human-readable reason.
 *  - Explicitness: weights, thresholds are config-as-code, not magic numbers.
 *  - Tractability: output has traceId + emittedAt so journal entry is complete.
 */

import {
  ConsensusSignal,
  ConsensusAction,
  TfSignal,
  RegimeSnapshot,
  DnaEngineConfig,
  DEFAULT_DNA_CONFIG,
} from './multi-tf-types';
import {
  DEFAULT_TF_WEIGHTS,
  aggregateTfSignals,
  adjustRegimeConfidence,
  formatConsensusReason,
  type AggregatedTfVotes,
} from './consensus-math';

export {
  DEFAULT_TF_WEIGHTS,
  aggregateTfSignals,
  adjustRegimeConfidence,
  formatConsensusReason,
  type AggregatedTfVotes,
} from './consensus-math';

// ─── Public ───────────────────────────────────────────────────────────────────

export interface ConsensusInput {
  tfSignals: TfSignal[];
  regime: RegimeSnapshot;
  traceId: string;
  now: number;
  config?: Partial<DnaEngineConfig>;
}

export function computeConsensus(input: ConsensusInput): ConsensusSignal {
  const { tfSignals, regime, traceId, now, config } = input;
  const cfg: DnaEngineConfig = { ...DEFAULT_DNA_CONFIG, ...config };

  const {
    weightedBull,
    weightedBear,
    spread,
    agreementCount,
    breakdown,
  } = aggregateTfSignals(tfSignals);

  // Volatility gate: reject if any TF exceeds max ATR%
  const maxAtrPct = Math.max(...tfSignals.map((s) => s.indicatorSnap.volatility.atrPct));
  const volatilityGateFailed = maxAtrPct > cfg.maxAtpPct * 100; // maxAtpPct stored as 0.05 (=5%)

  // Confidence gate
  const maxScore = Math.max(weightedBull, weightedBear);
  const confidenceGateFailed = maxScore < cfg.minConsensusConfidence;

  // Agreement gate
  const agreementGateFailed = agreementCount < cfg.minTfAgreement;

  // Decide action
  let action: ConsensusAction;
  if (volatilityGateFailed || confidenceGateFailed || agreementGateFailed || Math.abs(spread) < cfg.consensusSpread) {
    action = 'hold';
  } else if (spread > 0) {
    action = 'enter_long';
  } else {
    action = 'enter_short';
  }

  // Regime-aware confidence adjustment
  const confidence = adjustRegimeConfidence(maxScore, regime.regime);

  // Build reason (explicit gate outcomes surfaced)
  const reason = formatConsensusReason({
    action,
    spread,
    weightedBull,
    weightedBear,
    regime: regime.regime,
    agreementCount,
    totalSignals: tfSignals.length,
    maxAtrPct,
    maxScore,
    volatilityGateFailed,
    confidenceGateFailed,
    agreementGateFailed,
    cfg,
  });

  return {
    action,
    confidence,
    direction: action === 'enter_long' ? 'long' : action === 'enter_short' ? 'short' : undefined,
    entryPrice: null,
    slPrice: null,
    tpPrice: null,
    tfSignals: breakdown,
    weightedBullScore: weightedBull,
    weightedBearScore: weightedBear,
    regime: regime.regime,
    reason,
    traceId,
    emittedAt: now,
  };
}

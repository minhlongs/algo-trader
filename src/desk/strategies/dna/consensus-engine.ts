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
  TfId,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  MarketRegime,
  RegimeSnapshot,
  DnaEngineConfig,
  DEFAULT_DNA_CONFIG,
} from './multi-tf-types';

// ─── Default TF weights (long TFs dominate, short TFs provide timing) ─────────

const DEFAULT_TF_WEIGHTS: Partial<Record<TfId, number>> = {
  '1d': 0.30,
  '4h': 0.25,
  '1h': 0.20,
  '15m': 0.15,
  '5m': 0.07,
  '1m': 0.03,
};

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

  // Map TF → weight (fallback to equal weight split)
  const totalConfiguredWeight = Object.values(DEFAULT_TF_WEIGHTS).reduce((a, b) => a + b, 0);
  const tfWeights: Record<TfId, number> = {
    '1m': 0.03 / totalConfiguredWeight,
    '5m': 0.07 / totalConfiguredWeight,
    '15m': 0.15 / totalConfiguredWeight,
    '1h': 0.20 / totalConfiguredWeight,
    '4h': 0.25 / totalConfiguredWeight,
    '1d': 0.30 / totalConfiguredWeight,
  };

  let weightedBull = 0;
  let weightedBear = 0;
  let totalWeight = 0;
  let breakdown: ConsensusSignal['tfSignals'] = [];

  breakdown = tfSignals.map((s) => {
    const w = tfWeights[s.tf] || (1 / tfSignals.length);
    totalWeight += w;
    if (s.action === 'bull') weightedBull += w * s.confidence;
    else if (s.action === 'bear') weightedBear += w * s.confidence;
    return { tf: s.tf, action: s.action, confidence: s.confidence, weight: Math.round(w * 1000) / 1000 };
  });

  // Normalize
  if (totalWeight > 0) {
    weightedBull = Math.round((weightedBull / totalWeight) * 1000) / 1000;
    weightedBear = Math.round((weightedBear / totalWeight) * 1000) / 1000;
  }

  const spread = weightedBull - weightedBear;

  // Count directional agreement
  const bullCount = tfSignals.filter((s) => s.action === 'bull').length;
  const bearCount = tfSignals.filter((s) => s.action === 'bear').length;
  const winningAction = spread > 0 ? 'bull' : spread < 0 ? 'bear' : 'neutral';
  const agreementCount = winningAction === 'bull' ? bullCount : winningAction === 'bear' ? bearCount : 0;

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
  let confidence = maxScore;
  if (regime.regime === 'volatile') {
    confidence *= 0.7; // reduce confidence in volatile regimes
  } else if (regime.regime === 'ranging') {
    confidence *= 0.85;
  }
  confidence = Math.round(Math.min(confidence, 1) * 1000) / 1000;

  // Build reason (explicit gate outcomes surfaced)
  const gateReasons: string[] = [];
  if (volatilityGateFailed) gateReasons.push(`ATR=${maxAtrPct.toFixed(2)}% > max=${(cfg.maxAtpPct * 100).toFixed(2)}%`);
  if (confidenceGateFailed) gateReasons.push(`maxScore=${maxScore.toFixed(2)} < min=${cfg.minConsensusConfidence}`);
  if (agreementGateFailed) gateReasons.push(`agreement=${agreementCount} < min=${cfg.minTfAgreement}`);
  if (Math.abs(spread) < cfg.consensusSpread) gateReasons.push(`spread=${Math.abs(spread).toFixed(2)} < ${cfg.consensusSpread}`);

  const gateNote = gateReasons.length > 0 ? ` Gates: ${gateReasons.join('; ')}.` : '';
  const reason = `consensus=${action} spread=${spread.toFixed(2)} bull=${weightedBull} bear=${weightedBear} regime=${regime.regime} agreement=${agreementCount}/${tfSignals.length}${gateNote}`;

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

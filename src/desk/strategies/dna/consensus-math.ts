/**
 * Pure quorum, weight-aggregation, regime-adjustment, and voting math for ConsensusEngine.
 */

import type {
  ConsensusAction,
  ConsensusSignal,
  DnaEngineConfig,
  MarketRegime,
  TfId,
  TfSignal,
} from './multi-tf-types';

export const DEFAULT_TF_WEIGHTS: Partial<Record<TfId, number>> = {
  '1d': 0.30,
  '4h': 0.25,
  '1h': 0.20,
  '15m': 0.15,
  '5m': 0.07,
  '1m': 0.03,
};

export interface AggregatedTfVotes {
  weightedBull: number;
  weightedBear: number;
  spread: number;
  agreementCount: number;
  breakdown: ConsensusSignal['tfSignals'];
}

export function aggregateTfSignals(tfSignals: TfSignal[]): AggregatedTfVotes {
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

  const breakdown = tfSignals.map((s) => {
    const w = tfWeights[s.tf] || (1 / tfSignals.length);
    totalWeight += w;
    if (s.action === 'bull') weightedBull += w * s.confidence;
    else if (s.action === 'bear') weightedBear += w * s.confidence;
    return { tf: s.tf, action: s.action, confidence: s.confidence, weight: Math.round(w * 1000) / 1000 };
  });

  if (totalWeight > 0) {
    weightedBull = Math.round((weightedBull / totalWeight) * 1000) / 1000;
    weightedBear = Math.round((weightedBear / totalWeight) * 1000) / 1000;
  }

  const spread = weightedBull - weightedBear;
  const bullCount = tfSignals.filter((s) => s.action === 'bull').length;
  const bearCount = tfSignals.filter((s) => s.action === 'bear').length;
  const winningAction = spread > 0 ? 'bull' : spread < 0 ? 'bear' : 'neutral';
  const agreementCount = winningAction === 'bull' ? bullCount : winningAction === 'bear' ? bearCount : 0;

  return { weightedBull, weightedBear, spread, agreementCount, breakdown };
}

export function adjustRegimeConfidence(maxScore: number, regime: MarketRegime): number {
  let confidence = maxScore;
  if (regime === 'volatile') {
    confidence *= 0.7;
  } else if (regime === 'ranging') {
    confidence *= 0.85;
  }
  return Math.round(Math.min(confidence, 1) * 1000) / 1000;
}

export function formatConsensusReason(params: {
  action: ConsensusAction;
  spread: number;
  weightedBull: number;
  weightedBear: number;
  regime: MarketRegime;
  agreementCount: number;
  totalSignals: number;
  maxAtrPct: number;
  maxScore: number;
  volatilityGateFailed: boolean;
  confidenceGateFailed: boolean;
  agreementGateFailed: boolean;
  cfg: DnaEngineConfig;
}): string {
  const {
    action, spread, weightedBull, weightedBear, regime,
    agreementCount, totalSignals, maxAtrPct, maxScore,
    volatilityGateFailed, confidenceGateFailed, agreementGateFailed, cfg,
  } = params;

  const gateReasons: string[] = [];
  if (volatilityGateFailed) gateReasons.push(`ATR=${maxAtrPct.toFixed(2)}% > max=${(cfg.maxAtpPct * 100).toFixed(2)}%`);
  if (confidenceGateFailed) gateReasons.push(`maxScore=${maxScore.toFixed(2)} < min=${cfg.minConsensusConfidence}`);
  if (agreementGateFailed) gateReasons.push(`agreement=${agreementCount} < min=${cfg.minTfAgreement}`);
  if (Math.abs(spread) < cfg.consensusSpread) gateReasons.push(`spread=${Math.abs(spread).toFixed(2)} < ${cfg.consensusSpread}`);

  const gateNote = gateReasons.length > 0 ? ` Gates: ${gateReasons.join('; ')}.` : '';
  return `consensus=${action} spread=${spread.toFixed(2)} bull=${weightedBull} bear=${weightedBear} regime=${regime} agreement=${agreementCount}/${totalSignals}${gateNote}`;
}

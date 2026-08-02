/**
 * Signal Fusion Engine
 */
import { logger } from '../../shared/utils/logger';

export interface SignalInput { name: string; score: number; weight: number; }
export interface FusionResult { direction: 'UP' | 'DOWN' | 'NEUTRAL'; confidence: number; weightedScore: number; signals: SignalInput[]; reasoning: string; }

const UP_THRESHOLD = 0.1;
const DOWN_THRESHOLD = -0.1;
const EMA_DECAY = 0.9;
const CORRECT_BOOST = 1.2;
const INCORRECT_DECAY = 0.8;
const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 2.0;
const TREND_BOOST = ['momentum', 'trend', 'macd'];
const REVERT_BOOST = ['revert', 'reversal'];
const VOL_BOOST = ['volatility', 'range', 'bb'];

function matchesAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some(kw => lower.startsWith(kw.toLowerCase()));
}

export function adaptWeightsForRegime(
  signals: SignalInput[],
  regime: string,
): SignalInput[] {
  if (signals.length === 0) return [];
  const norm = regime.toLowerCase().trim();
  if (!norm || norm === 'volatile') return signals;
  return signals.map(signal => {
    let factor = 1.0;
    if (norm === 'trending_up') {
      if (matchesAny(signal.name, TREND_BOOST)) factor = 1.2;
      else if (matchesAny(signal.name, REVERT_BOOST)) factor = 0.9;
    } else if (norm === 'trending_down') {
      if (matchesAny(signal.name, REVERT_BOOST)) factor = 1.2;
      else if (matchesAny(signal.name, TREND_BOOST)) factor = 0.9;
    } else if (norm === 'ranging') {
      if (matchesAny(signal.name, VOL_BOOST)) factor = 1.15;
    }
    const newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, signal.weight * factor));
    return { ...signal, weight: newWeight };
  });
}

export function fuseSignals(signals: SignalInput[], regime?: string): FusionResult {
  const adaptedSignals = regime ? adaptWeightsForRegime(signals, regime) : signals;
  if (adaptedSignals.length === 0) {
    return { direction: 'NEUTRAL', confidence: 0, weightedScore: 0, signals: adaptedSignals, reasoning: 'No signals provided' };
  }
  const clamped = adaptedSignals.map(s => ({ ...s, score: Math.max(-1, Math.min(1, s.score)), weight: Math.max(0, s.weight) }));
  const totalWeight = clamped.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) {
    return { direction: 'NEUTRAL', confidence: 0, weightedScore: 0, signals: clamped, reasoning: 'All signal weights are zero' };
  }
  const weightedScore = clamped.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;
  let direction: FusionResult['direction'];
  if (weightedScore > UP_THRESHOLD) direction = 'UP';
  else if (weightedScore < DOWN_THRESHOLD) direction = 'DOWN';
  else direction = 'NEUTRAL';
  const confidence = Math.min(1, Math.abs(weightedScore));
  const signalLines = clamped.map(s => `${s.name}=${s.score.toFixed(3)}(w=${s.weight.toFixed(2)})`).join(', ');
  const reasoning = `Weighted score ${weightedScore.toFixed(3)} → ${direction}. Signals: [${signalLines}]`;
  logger.debug('[SignalFusion] Fusion complete', { direction, confidence, weightedScore, signalCount: signals.length });
  return { direction, confidence, weightedScore, signals: clamped, reasoning };
}

export function updateWeights(signals: SignalInput[], actualOutcome: 'UP' | 'DOWN'): SignalInput[] {
  return signals.map(signal => {
    const predictedUp = signal.score > 0;
    const predictedDown = signal.score < 0;
    const isNeutral = signal.score === 0;
    let adjustment: number;
    if (isNeutral) { adjustment = signal.weight; }
    else {
      const correct = (actualOutcome === 'UP' && predictedUp) || (actualOutcome === 'DOWN' && predictedDown);
      const factor = correct ? CORRECT_BOOST : INCORRECT_DECAY;
      adjustment = EMA_DECAY * signal.weight + (1 - EMA_DECAY) * factor;
    }
    const newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, adjustment));
    return { ...signal, weight: newWeight };
  });
}

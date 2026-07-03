/**
 * Regime Handler
 * Gathers market regime data from regime-detector and SignalFusionEngine.
 */

import type { CopilotResponse } from '../response-formatter';
import { detectRegime } from '../../../strategies/dna/regime-detector';
import { fuseSignals } from '../../../intelligence/signal-fusion-engine';
import type { RegimeSnapshot, TfId, TimeframeIndicators } from '../../../strategies/dna/multi-tf-types';

export interface RegimeData {
  regime: string;
  confidence: number;
  signalDirection: string;
  signalConfidence: number;
  tfAnalysis: string[];
}

/**
 * Handle a market regime query.
 * Accepts optional injected dependencies for testing.
 */
export async function handleRegimeQuery(
  _context?: { page?: string; strategyId?: string },
  deps?: {
    indicatorsByTf?: Map<TfId, TimeframeIndicators>;
  },
): Promise<CopilotResponse> {
  const now = Date.now();
  let regimeSnapshot: RegimeSnapshot | null = null;

  // Use provided indicators if available, otherwise build an empty regime
  if (deps?.indicatorsByTf && deps.indicatorsByTf.size > 0) {
    regimeSnapshot = detectRegime(deps.indicatorsByTf, now);
  }

  // Fuse signals to get current market direction
  const fused = fuseSignals([], regimeSnapshot?.regime);

  // TF breakdown
  const tfLines: string[] = [];
  if (deps?.indicatorsByTf && deps.indicatorsByTf.size > 0) {
    for (const [tf, ind] of deps.indicatorsByTf) {
      tfLines.push(`${tf}: ADX=${ind.trend.adx.toFixed(1)} ${ind.trend.adxTrend}`);
    }
  }

  const regimeLabel = regimeSnapshot?.regime ?? 'unknown (no data)';
  const regimeConfidence = regimeSnapshot ? regimeSnapshot.regimeConfidence * 100 : 0;

  const answer = [
    '**Market Regime**',
    `- Regime: ${regimeLabel}`,
    `- Regime confidence: ${regimeConfidence.toFixed(0)}%`,
    `- Dominant TF: ${regimeSnapshot?.dominantTf ?? 'N/A'}`,
    `- Fused signal: ${fused.direction} (confidence: ${(fused.confidence * 100).toFixed(0)}%)`,
    ...(tfLines.length > 0 ? ['', '**Per-TF Analysis:**', ...tfLines.map(l => `- ${l}`)] : []),
    ...(regimeSnapshot?.reason ? ['', `**Reason:** ${regimeSnapshot.reason}`] : []),
  ].join('\n');

  return {
    answer,
    actions: [
      { label: 'View Signals', action: 'navigate', payload: '/signals' },
      { label: 'Refresh', action: 'execute', payload: 'market_regime' },
    ],
    sourceData: {
      regime: regimeLabel,
      confidence: regimeConfidence / 100,
      signalDirection: fused.direction,
      signalConfidence: fused.confidence,
      tfAnalysis: tfLines,
    },
  };
}

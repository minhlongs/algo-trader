/**
 * Shared fixtures for consensus-engine tests.
 *
 * Exports NOW, IND, sig, regime, input helpers so that
 * consensus-engine.test.ts and consensus-engine-regime.test.ts
 * share identical input construction.
 */

import type {
  TfSignal,
  RegimeSnapshot,
  DnaEngineConfig,
} from '../multi-tf-types.js';
import type { ConsensusInput } from '../consensus-engine.js';

export const NOW = 1_700_000_000_000;

export const IND = {
  trend: { ema20: 100, ema50: 99, ema200: 97, adx: 20, adxTrend: 'sideways' as const },
  momentum: { rsi: 50, macdLine: 0, macdSignal: 0, macdHist: 0 },
  volatility: { atr: 1, atrPct: 0.01, bollingerUpper: 101, bollingerMid: 100, bollingerLower: 99, bollingerWidthPct: 0.02 },
};

export function sig(
  tf: TfSignal['tf'],
  action: TfSignal['action'],
  confidence = 0.7,
  reason = 'test',
  emittedAt = NOW,
  overrides: Partial<TfSignal> = {},
): TfSignal {
  return {
    tf,
    action,
    confidence,
    entryHint: null,
    slHint: null,
    tpHint: null,
    reason,
    indicatorSnap: IND,
    emittedAt,
    ...overrides,
  };
}

export function regime(snapshot: Partial<RegimeSnapshot> = {}): RegimeSnapshot {
  return {
    regime: 'ranging',
    dominantTf: '1d',
    regimeConfidence: 0.6,
    validFrom: NOW,
    validUntil: NOW + 60_000,
    reason: 'baseline',
    ...snapshot,
  };
}

export function input(
  tfSignals: TfSignal[],
  reg: RegimeSnapshot,
  traceId = 'trace-1',
  now = NOW,
  config?: Partial<DnaEngineConfig>,
) {
  return { tfSignals, regime: reg, traceId, now, config } as ConsensusInput;
}

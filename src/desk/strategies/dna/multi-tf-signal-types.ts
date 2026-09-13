/**
 * Cheetahclaws-DNA: Multi-Timeframe Consensus Engine — Signal Types
 */

import type { TfId, TimeframeIndicators } from './multi-tf-indicators-types';

export type TfSignalAction = 'bull' | 'bear' | 'neutral';

export interface TfSignal {
  tf: TfId;
  action: TfSignalAction;
  confidence: number; // 0..1
  entryHint: number | null; // suggested entry price (null = market)
  slHint: number | null; // suggested stop-loss
  tpHint: number | null; // suggested take-profit
  reason: string; // LEGIBILITY: human-readable reason
  indicatorSnap: Pick<TimeframeIndicators, 'trend' | 'momentum' | 'volatility'>;
  emittedAt: number; // epoch-ms
}

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

export interface RegimeSnapshot {
  regime: MarketRegime;
  regimeConfidence: number; // 0..1
  dominantTf: TfId; // the TF that "leads" this regime
  reason: string;
  validFrom: number;
  validUntil: number | null; // null = still valid
}

export type ConsensusAction = 'enter_long' | 'enter_short' | 'hold';

export interface ConsensusSignal {
  action: ConsensusAction;
  confidence: number; // 0..1 composite
  direction?: 'long' | 'short'; // undefined if action === 'hold'
  entryPrice: number | null;
  slPrice: number | null;
  tpPrice: number | null;
  // Per-TF breakdown — EXPLICITNESS: all evidence surfaced, nothing hidden.
  tfSignals: Array<{ tf: TfId; action: TfSignalAction; confidence: number; weight: number }>;
  weightedBullScore: number;
  weightedBearScore: number;
  regime: MarketRegime;
  reason: string;
  traceId: string; // TRACTABILITY: end-to-end id
  emittedAt: number;
}

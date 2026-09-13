/**
 * Cheetahclaws-DNA: Multi-Timeframe Consensus Engine — Indicator Types
 */

export type TfId = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const TF_RESOLUTIONS: Record<TfId, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export function tfLabel(tf: TfId): string {
  return tf;
}

export interface Candle {
  timestamp: number; // epoch-ms, open of this candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TrendIndicators {
  ema20: number;
  ema50: number;
  ema200: number | null; // null on TFs that don't have enough history
  adx: number;
  adxTrend: 'up' | 'down' | 'sideways';
}

export interface MomentumIndicators {
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
}

export interface VolatilityIndicators {
  atr: number;
  atrPct: number; // ATR / close
  bollingerUpper: number;
  bollingerMid: number;
  bollingerLower: number;
  bollingerWidthPct: number;
}

export interface MicroStructureIndicators {
  // Short-TF only (1m, 5m). Null on higher TFs.
  obi: number | null; // order-book imbalance -1..1
  vwap: number | null;
  deltaCandle: number | null; // buy-vol - sell-vol per candle
}

export interface TimeframeIndicators {
  tf: TfId;
  candles: Candle[];
  trend: TrendIndicators;
  momentum: MomentumIndicators;
  volatility: VolatilityIndicators;
  microstructure: MicroStructureIndicators;
  computedAt: number; // epoch-ms
}

/**
 * Regime Detector Types
 * Definitions and configurations for market regime classification
 */

export type MarketRegime = 'NORMAL' | 'VOLATILE' | 'TRENDING' | 'CRASH';

export interface RegimeMetrics {
  regime: MarketRegime;
  volatility: number;
  spreadAvg: number;
  spreadStdDev: number;
  volumeChange: number;
  confidence: number;
  timestamp: number;
}

export interface RegimeConfig {
  volatilityThresholds: {
    normal: number;
    volatile: number;
    crash: number;
  };
  lookbackPeriods: number;
  checkIntervalMs: number;
}

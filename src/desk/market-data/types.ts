// SPDX-License-Identifier: MIT
/**
 * Market Data Types
 * Shared types for market data providers and quality monitoring
 */

/**
 * Supported market data providers
 */
export enum MarketDataSource {
  SANTIMENT = 'santiment',
  LUNARCRUSH = 'lunarcrush',
  COINGECKO = 'coingecko',
  BINANCE = 'binance',
  KUCOIN = 'kucoin',
}

/**
 * Candle (OHLCV) data structure
 */
export interface Candle {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  status: 'complete' | 'partial' | 'pending';
  provider?: MarketDataSource;
}

/**
 * Timeframe enum
 */
export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

/**
 * Provider health status for failover
 */
export enum ProviderHealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CIRCUIT_OPEN = 'circuit_open',
  FAILOVER_ACTIVE = 'failover_active',
}

/**
 * Quality configuration for a provider
 */
export interface ProviderQualityConfig {
  provider: MarketDataSource;
  maxLatencyMs?: number;
  minAvailability?: number;
  maxErrorRate?: number;
  failoverTarget?: MarketDataSource;
  enableGapDetection?: boolean;
  enableOutlierDetection?: boolean;
  enableSlaTracking?: boolean;
}

/**
 * Failover configuration
 */
export interface ProviderFailoverConfig {
  primary: MarketDataSource;
  secondary: MarketDataSource;
  failureThreshold: number;
  failbackCooldownMs: number;
  recoveryTimeMs: number;
  enableAutoFailback: boolean;
  healthCheckIntervalMs: number;
}

/**
 * Quality report for a provider
 */
export interface QualityReport {
  provider: MarketDataSource;
  slaReport: SlaReport | null;
  gapStats: GapStats[];
  outlierCount: number;
  healthScore: number;
  isActive: boolean;
  lastUpdate: number;
}

/**
 * SLA window report
 */
export interface SlaWindowReport {
  windowHours: number;
  availability: number;
  errorRate: number;
  avgLatency: number;
  latencyPercentiles: { p50: number; p95: number; p99: number };
  completeness: number;
  totalRequests: number;
}

/**
 * SLA report
 */
export interface SlaReport {
  provider: MarketDataSource;
  windows: Record<number, SlaWindowReport>;
  healthScore: number;
  lastUpdate: number;
}

/**
 * Gap statistics
 */
export interface GapStats {
  symbol: string;
  timeframe: string;
  provider: string;
  consecutiveMissing: number;
  totalGaps: number;
  completenessPercent: number;
  expectedCandles: number;
  receivedCandles: number;
  lastCandleTime: number | null;
}

/**
 * Outlier event
 */
export interface OutlierEvent {
  symbol: string;
  timestamp: number;
  outlierType: 'price_spike' | 'volume_anomaly' | 'price_gap';
  severity: 'low' | 'medium' | 'high' | 'critical';
  value: number;
  expectedRange: [number, number];
  zScore?: number;
  iqrScore?: number;
  provider?: MarketDataSource;
}

/**
 * Rolling statistics window
 */
export interface StatsWindow {
  values: number[];
  sum: number;
  sumOfSquares: number;
  sorted: number[];
  sortedDirty: boolean;
}

/**
 * Failover event
 */
export interface FailoverEvent {
  timestamp: number;
  fromProvider: MarketDataSource;
  toProvider: MarketDataSource;
  reason: string;
  triggeredBy: 'automatic' | 'manual';
}

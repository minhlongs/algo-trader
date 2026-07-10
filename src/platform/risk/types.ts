/**
 * Platform Risk Types — shared interfaces for the risk engine service layer.
 *
 * The mathematical engines live in @desk/risk/.
 * This layer adds persistence, caching, alerting, and Exposable results.
 */

import type {
  VaRConfig,
  VaRResult,
  PositionPnlInput,
  CorrelationMatrix,
  CorrelationPair,
  AtrConfig,
  AtrResult,
  AtrCandle,
  DrawdownConfig,
  DrawdownMetrics,
  DrawdownAlert,
  KellyConfig,
  KellySizingInput,
  KellySizingResult,
} from '@desk/risk';

// ── Feature flag ─────────────────────────────────────────────────────────────

export const RISK_FEATURE_FLAG = 'ENABLE_RISK_ENGINE';

// ── Portfolio Position (platform layer) ──────────────────────────────────────

export interface RiskPosition {
  symbol: string;
  currentValue: number;
  side: 'long' | 'short';
  returns: number[];
  /** Average daily volatility (sigma) for quick VaR bypass */
  dailyVolatility?: number;
}

// ── Risk Engine Request/Response ──────────────────────────────────────────────

export interface VarRequest {
  positions: RiskPosition[];
  confidence: 0.95 | 0.99;
  horizonDays?: number;
  method?: 'parametric' | 'historical' | 'both';
}

export interface VarResponse {
  success: boolean;
  data: {
    parametricVaR: number | null;
    historicalVaR: number | null;
    cVaR: number | null;
    confidence: number;
    horizonDays: number;
    totalPortfolioValue: number;
    sampleSize: number;
    /**
     * Warning when sample < 100 trades — confidence intervals widen.
     */
    dataQualityWarning: string | null;
  };
  cachedAt?: string;
  computedMs: number;
}

export interface CorrelationRequest {
  positions: { symbol: string; returns: number[] }[];
}

export interface CorrelationResponse {
  success: boolean;
  data: {
    symbols: string[];
    matrix: (number | null)[][];
    highlyCorrelatedPairs: CorrelationPair[];
    diversificationScore: number;
  };
  cachedAt?: string;
  computedMs: number;
}

export interface DrawdownRequest {
  /** 24h rolling P&L threshold as fraction (e.g. 0.05 = 5%) */
  dailyThreshold?: number;
  /** Total drawdown threshold as fraction */
  totalThreshold?: number;
  maxConsecutiveLosses?: number;
}

export interface DrawdownResponse {
  success: boolean;
  data: DrawdownMetrics & {
    history: { date: string; pnl: number }[];
    alerts: DrawdownAlert[];
  };
}

export interface AtrStopRequest {
  symbol: string;
  candles: AtrCandle[];
  direction: 'long' | 'short';
  period?: number;
  multiplier?: number;
}

export interface AtrStopResponse {
  success: boolean;
  data: AtrResult;
  computedMs: number;
}

export interface KellySizingRequest {
  winProbability: number;
  winLossRatio: number;
  portfolioValue: number;
  correlation?: number;
  currentExposure?: number;
  kellyFraction?: number;
}

export interface KellySizingResponse {
  success: boolean;
  data: KellySizingResult;
  computedMs: number;
}

// ── Alert/Dispatch Types ──────────────────────────────────────────────────────

export interface AlertRecord {
  id?: number;
  type: 'drawdown_daily' | 'drawdown_total' | 'drawdown_consecutive' | 'var_breach' | 'correlation_breach';
  severity: 'info' | 'warn' | 'critical';
  userId?: string;
  tenantId?: string;
  message: string;
  detail: Record<string, unknown>;
  sentVia: ('telegram' | 'email' | 'webhook')[];
  sentAt: number;
}

// ── Cache Keys ───────────────────────────────────────────────────────────────

export const CACHE_KEYS = {
  var: (userId: string) => `risk:var:${userId}`,
  correlation: (userId: string) => `risk:correlation:${userId}`,
  drawdown: (userId: string) => `risk:drawdown:${userId}`,
  alertThrottle: (userId: string) => `risk:alert:throttle:${userId}`,
} as const;

export const CACHE_TTL_SECONDS = 300; // 5 minutes for var/correlation

export const ALERT_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes

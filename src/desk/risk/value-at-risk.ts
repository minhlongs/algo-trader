/**
 * Value-at-Risk (VaR) and Conditional VaR (Expected Shortfall) Calculator
 *
 * Supports parametric (variance-covariance) and historical methods
 * at 95% (z=1.645) and 99% (z=2.326) confidence, with 1-day and 10-day horizons.
 *
 * Formulas:
 *   Parametric VaR = portfolio_value * z_score * sigma * sqrt(t)
 *   Historical VaR = |percentile(returns, 1-confidence)| * portfolio_value * sqrt(t)
 *   CVaR = average loss beyond VaR threshold (either parametric or historical)
 */
import { logger } from '../../shared/utils/logger';

// ── Types ───────────────────────────────────────────────────────────────────

export interface VaRConfig {
  confidence: 0.95 | 0.99;
  horizonDays: number;
  method: 'parametric' | 'historical' | 'both';
}

export interface VaRResult {
  parametricVaR?: number;
  historicalVaR?: number;
  cVaR?: number;
  confidence: number;
  horizonDays: number;
  totalPortfolioValue: number;
}

/** Per-position input: symbol, current market value, and historical daily returns (decimal) */
export interface PositionPnlInput {
  symbol: string;
  currentValue: number;
  returns: number[];
}

// ── Constants ───────────────────────────────────────────────────────────────

const Z_SCORES: Record<number, number> = { 0.95: 1.645, 0.99: 2.326 };

// ── Math Utilities ──────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sample standard deviation (n-1 denominator). Requires >= 2 values. */
function stdDev(values: number[], avg?: number): number {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Weighted-sum portfolio returns; uses the shortest series across positions. */
function portfolioReturns(positions: PositionPnlInput[], weights: number[]): number[] {
  if (positions.length === 0 || positions[0].returns.length === 0) return [];
  const n = Math.min(...positions.map((p) => p.returns.length));
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    let r = 0;
    for (let i = 0; i < positions.length; i++) r += weights[i] * positions[i].returns[t];
    out.push(r);
  }
  return out;
}

// ── ValueAtRiskCalculator (static methods) ──────────────────────────────────

export class ValueAtRiskCalculator {
  /** Parametric VaR: portfolio_value * z_alpha * sigma * sqrt(t). Zero-mean assumption. */
  static parametricVaR(
    returns: number[], pv: number, confidence: number, horizon: number,
  ): number {
    const z = Z_SCORES[confidence];
    if (z === undefined) {
      logger.warn(`[VaR] Unsupported confidence ${confidence}, using 0.95`);
      return ValueAtRiskCalculator.parametricVaR(returns, pv, 0.95, horizon);
    }
    if (returns.length < 2) { logger.warn('[VaR] Need >= 2 periods for parametric VaR'); return 0; }
    const sigma = stdDev(returns);
    if (!isFinite(sigma) || sigma <= 0) return 0;
    return Math.abs(pv * z * sigma * Math.sqrt(horizon));
  }

  /** Historical VaR: sort returns, take (1-confidence) percentile, scale by sqrt(horizon). */
  static historicalVaR(
    returns: number[], pv: number, confidence: number, horizon: number,
  ): number {
    if (returns.length === 0) { logger.warn('[VaR] No returns for historical VaR'); return 0; }
    const sorted = [...returns].sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor((1 - confidence) * sorted.length));
    return Math.abs(sorted[idx]) * pv * Math.sqrt(horizon);
  }

  /** Historical CVaR: average of returns at or below the VaR percentile threshold. */
  static cVaRHistorical(
    returns: number[], pv: number, confidence: number, horizon: number,
  ): number {
    if (returns.length === 0) { logger.warn('[VaR] No returns for historical CVaR'); return 0; }
    const sorted = [...returns].sort((a, b) => a - b);
    const tail = sorted.slice(0, Math.max(1, Math.floor((1 - confidence) * sorted.length) + 1));
    return Math.abs(mean(tail)) * pv * Math.sqrt(horizon);
  }

  /** Parametric CVaR: pv * (phi(z) / (1-alpha)) * sigma * sqrt(t) for normal returns. */
  static cVaRParametric(
    returns: number[], pv: number, confidence: number, horizon: number,
  ): number {
    const z = Z_SCORES[confidence];
    if (z === undefined || returns.length < 2) return 0;
    const sigma = stdDev(returns);
    if (!isFinite(sigma) || sigma <= 0) return 0;
    return pv * (normalPdf(z) / (1 - confidence)) * sigma * Math.sqrt(horizon);
  }
}

// ── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Calculate VaR and CVaR for a portfolio of positions.
 *
 * Weights are derived from each position's currentValue / totalPortfolioValue.
 * Portfolio-level returns are the weighted sum of per-position return series.
 *
 * @param positions - Position inputs with historical daily returns
 * @param config   - Confidence level, horizon in days, and calculation method
 * @returns VaRResult with dollar-denominated risk metrics
 */
export function calculateVaR(positions: PositionPnlInput[], config: VaRConfig): VaRResult {
  const pv = positions.reduce((s, p) => s + p.currentValue, 0);

  const empty: VaRResult = {
    confidence: config.confidence, horizonDays: config.horizonDays,
    totalPortfolioValue: pv, parametricVaR: 0, historicalVaR: 0, cVaR: 0,
  };

  if (pv <= 0 || positions.length === 0) {
    if (pv <= 0) logger.warn('[VaR] Portfolio value <= 0, returning zero VaR');
    return empty;
  }

  const weights = positions.map((p) => p.currentValue / pv);
  const portRets = portfolioReturns(positions, weights);

  if (portRets.length === 0) {
    logger.warn('[VaR] No portfolio return data available, returning zero VaR');
    return empty;
  }

  const result: VaRResult = {
    confidence: config.confidence, horizonDays: config.horizonDays, totalPortfolioValue: pv,
  };
  const V = ValueAtRiskCalculator;
  const c = config.confidence;
  const h = config.horizonDays;

  if (config.method === 'parametric' || config.method === 'both') {
    result.parametricVaR = V.parametricVaR(portRets, pv, c, h);
  }
  if (config.method === 'historical' || config.method === 'both') {
    result.historicalVaR = V.historicalVaR(portRets, pv, c, h);
  }
  result.cVaR = config.method === 'parametric'
    ? V.cVaRParametric(portRets, pv, c, h)
    : V.cVaRHistorical(portRets, pv, c, h);

  return result;
}

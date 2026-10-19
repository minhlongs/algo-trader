/**
 * Pure Pearson Correlation & Strength Classification Helpers
 */

import { logger } from '../../shared/utils/logger';

export type CorrelationStrength =
  | 'strong_positive'
  | 'moderate_positive'
  | 'weak'
  | 'moderate_negative'
  | 'strong_negative';

export function classifyStrength(r: number): CorrelationStrength {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? 'strong_positive' : 'strong_negative';
  if (abs >= 0.4) return r > 0 ? 'moderate_positive' : 'moderate_negative';
  return 'weak';
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute the Pearson correlation coefficient between two equal-length arrays.
 * Returns NaN when either series has zero variance or fewer than 3 points.
 */
export function computePearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;

  if (n !== y.length) {
    logger.warn('[PortfolioCorrelation] Mismatched input lengths, using min length');
    const minLen = Math.min(n, y.length);
    return computePearsonCorrelation(x.slice(0, minLen), y.slice(0, minLen));
  }

  if (n < 3) {
    logger.warn(`[PortfolioCorrelation] Insufficient data points: ${n} (need >= 3)`);
    return NaN;
  }

  const meanX = mean(x);
  const meanY = mean(y);

  let cov = 0;
  let varX = 0;
  let varY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX === 0 || varY === 0) {
    logger.warn('[PortfolioCorrelation] Zero variance detected — cannot compute correlation');
    return NaN;
  }

  return cov / Math.sqrt(varX * varY);
}

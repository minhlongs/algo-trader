import { logger } from '../../shared/utils/logger';

/**
 * Expected Shortfall (Conditional VaR) Calculator
 */
export function calculateExpectedShortfall(
  returns: number[],
  pv: number,
  confidence: 0.95 | 0.99,
  horizon: number
): number {
  if (returns.length === 0) {
    logger.warn('[VaR] No returns for ES calculation');
    return 0;
  }

  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;
  const tailIdx = Math.max(1, Math.floor((1 - confidence) * n));

  // Calculate average of the tail
  const tail = sorted.slice(0, tailIdx);
  const avg = tail.reduce((s, v) => s + v, 0) / tail.length;

  return Math.abs(avg) * pv * Math.sqrt(horizon);
}

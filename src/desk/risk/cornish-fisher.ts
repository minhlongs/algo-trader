import { logger } from '../../shared/utils/logger';

/**
 * Calculates Cornish-Fisher VaR:
 * VaR = -pv * (mu + sigma * z_cf)
 * where z_cf = z + (1/6)(z^2 - 1)S + (1/24)(z^3 - 3z)K + ...
 * S = skewness, K = excess kurtosis
 */
export function calculateCornishFisherVaR(
  returns: number[],
  pv: number,
  confidence: 0.95 | 0.99,
  horizon: number
): number {
  if (returns.length < 4) {
    logger.warn('[VaR] Need >= 4 periods for Cornish-Fisher VaR, falling back');
    return 0;
  }

  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  if (std === 0) return 0;

  const skew = returns.reduce((a, b) => a + ((b - mean) / std) ** 3, 0) / n;
  const kurtosis = returns.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / n - 3;

  const z = confidence === 0.95 ? 1.645 : 2.326;

  // Cornish-Fisher expansion for z-score
  const zCf = z +
    (1 / 6) * (z ** 2 - 1) * skew +
    (1 / 24) * (z ** 3 - 3 * z) * kurtosis -
    (1 / 36) * (2 * z ** 3 - 5 * z) * (skew ** 2);

  return Math.abs(pv * zCf * std * Math.sqrt(horizon));
}

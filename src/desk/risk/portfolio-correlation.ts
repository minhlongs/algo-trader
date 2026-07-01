/**
 * Portfolio Correlation Matrix Calculator
 *
 * Computes Pearson correlation between position return series to identify
 * concentration risk. High pairwise correlation means positions move together,
 * undermining diversification.
 */
import { logger } from '../../shared/utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CorrelationMatrix {
  symbols: string[];
  /** matrix[i][j] = Pearson r between symbols[i] and symbols[j] */
  matrix: number[][];
}

export interface CorrelationPair {
  symbolA: string;
  symbolB: string;
  correlation: number;
  strength: 'strong_positive' | 'moderate_positive' | 'weak' | 'moderate_negative' | 'strong_negative';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_DATA_POINTS = 5;
const DEFAULT_THRESHOLD = 0.7;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyStrength(r: number): CorrelationPair['strength'] {
  const abs = Math.abs(r);
  if (abs >= 0.7) return r > 0 ? 'strong_positive' : 'strong_negative';
  if (abs >= 0.4) return r > 0 ? 'moderate_positive' : 'moderate_negative';
  return 'weak';
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── Main Class ──────────────────────────────────────────────────────────────

export class PortfolioCorrelation {
  /**
   * Compute the Pearson correlation coefficient between two equal-length arrays.
   * Returns NaN when either series has zero variance or fewer than 3 points.
   */
  static pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;

    if (n !== y.length) {
      logger.warn('[PortfolioCorrelation] Mismatched input lengths, using min length');
      const minLen = Math.min(n, y.length);
      return PortfolioCorrelation.pearsonCorrelation(x.slice(0, minLen), y.slice(0, minLen));
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

  /**
   * Build an NxN correlation matrix from position daily-return series.
   * Discards any symbol with fewer than MIN_DATA_POINTS entries.
   */
  static buildCorrelationMatrix(positionReturns: Record<string, number[]>): CorrelationMatrix {
    const allSymbols = Object.keys(positionReturns);

    const symbols = allSymbols.filter((sym) => {
      const data = positionReturns[sym];
      if (!data || data.length < MIN_DATA_POINTS) {
        logger.warn(`[PortfolioCorrelation] Excluding ${sym}: only ${data?.length ?? 0} data points (need ${MIN_DATA_POINTS})`);
        return false;
      }
      return true;
    });

    if (symbols.length < 2) {
      logger.warn('[PortfolioCorrelation] Fewer than 2 symbols with sufficient data — returning empty matrix');
      return { symbols, matrix: [] };
    }

    const n = symbols.length;
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(NaN));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1; // diagonal
      for (let j = i + 1; j < n; j++) {
        const r = PortfolioCorrelation.pearsonCorrelation(
          positionReturns[symbols[i]],
          positionReturns[symbols[j]],
        );
        matrix[i][j] = r;
        matrix[j][i] = r;
      }
    }

    return { symbols, matrix };
  }

  /**
   * Find all pairs whose absolute correlation exceeds the threshold.
   * Results are sorted by absolute correlation strength (descending).
   */
  static findHighlyCorrelated(
    matrix: CorrelationMatrix,
    threshold: number = DEFAULT_THRESHOLD,
  ): CorrelationPair[] {
    const { symbols, matrix: m } = matrix;
    const pairs: CorrelationPair[] = [];

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const r = m[i][j];
        if (isNaN(r)) continue;
        if (Math.abs(r) >= threshold) {
          pairs.push({
            symbolA: symbols[i],
            symbolB: symbols[j],
            correlation: r,
            strength: classifyStrength(r),
          });
        }
      }
    }

    pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    return pairs;
  }

  /**
   * Compute a diversification score in [0, 1] from the correlation matrix.
   * 1 = perfectly uncorrelated (ideal diversification).
   * 0 = all pairs fully correlated (no diversification benefit).
   *
   * Formula: 1 - mean(|correlation|) across all unique pairs.
   */
  static diversificationScore(matrix: CorrelationMatrix): number {
    const { symbols, matrix: m } = matrix;

    if (symbols.length < 2) {
      return symbols.length === 1 ? 1 : 0; // single asset = fully "diversified" by definition
    }

    let sumAbs = 0;
    let count = 0;

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const r = m[i][j];
        if (!isNaN(r)) {
          sumAbs += Math.abs(r);
          count++;
        }
      }
    }

    if (count === 0) return 0;

    const avgAbsCorrelation = sumAbs / count;
    return Math.max(0, Math.min(1, 1 - avgAbsCorrelation));
  }
}

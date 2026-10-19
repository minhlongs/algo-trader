/**
 * Portfolio Correlation Matrix Calculator
 *
 * Computes Pearson correlation between position return series to identify
 * concentration risk. High pairwise correlation means positions move together,
 * undermining diversification.
 */
import { logger } from '../../shared/utils/logger';
import {
  classifyStrength,
  computePearsonCorrelation,
  type CorrelationStrength,
} from './portfolio-correlation-math';

export interface CorrelationMatrix {
  symbols: string[];
  /** matrix[i][j] = Pearson r between symbols[i] and symbols[j] */
  matrix: number[][];
}

export interface CorrelationPair {
  symbolA: string;
  symbolB: string;
  correlation: number;
  strength: CorrelationStrength;
}

const MIN_DATA_POINTS = 5;
const DEFAULT_THRESHOLD = 0.7;

export class PortfolioCorrelation {
  /**
   * Compute the Pearson correlation coefficient between two equal-length arrays.
   * Returns NaN when either series has zero variance or fewer than 3 points.
   */
  static pearsonCorrelation(x: number[], y: number[]): number {
    return computePearsonCorrelation(x, y);
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
      matrix[i][i] = 1;
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
   * Formula: 1 - mean(|correlation|) across all unique pairs.
   */
  static diversificationScore(matrix: CorrelationMatrix): number {
    const { symbols, matrix: m } = matrix;

    if (symbols.length < 2) {
      return symbols.length === 1 ? 1 : 0;
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

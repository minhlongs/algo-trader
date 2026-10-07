import type {
  CorrelationMatrixResult,
  PriceObservationVector,
} from './cross-venue-correlation-types';

export class CrossVenueCorrelationMatrix {
  private readonly windowSize: number;
  private readonly observations: PriceObservationVector[] = [];

  public constructor(windowSize: number = 50) {
    this.windowSize = windowSize;
  }

  public addObservation(obs: PriceObservationVector): void {
    this.observations.push(obs);
    if (this.observations.length > this.windowSize) {
      this.observations.shift();
    }
  }

  public computeCorrelation(symbols: readonly string[]): CorrelationMatrixResult {
    const n = symbols.length;
    if (n === 0 || this.observations.length < 2) {
      const identity = symbols.map((_, i) => symbols.map((__, j) => (i === j ? 1 : 0)));
      return { symbols, matrix: identity, avgPairwiseCorrelation: 0, sampleCount: this.observations.length };
    }

    // Compute log returns for each symbol
    const returnsBySymbol = new Map<string, number[]>();
    for (const sym of symbols) {
      returnsBySymbol.set(sym, []);
    }

    for (let t = 1; t < this.observations.length; t++) {
      const prev = this.observations[t - 1]!.pricesBySymbol;
      const curr = this.observations[t]!.pricesBySymbol;

      for (const sym of symbols) {
        const p0 = prev[sym];
        const p1 = curr[sym];
        if (p0 !== undefined && p1 !== undefined && p0 > 0 && p1 > 0) {
          returnsBySymbol.get(sym)!.push(Math.log(p1 / p0));
        } else {
          returnsBySymbol.get(sym)!.push(0);
        }
      }
    }

    const matrix: number[][] = [];
    let pairSum = 0;
    let pairCount = 0;

    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      const s1 = symbols[i]!;
      const r1 = returnsBySymbol.get(s1) ?? [];
      const mean1 = r1.reduce((acc, v) => acc + v, 0) / (r1.length || 1);

      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i]![j] = 1.0;
          continue;
        }

        const s2 = symbols[j]!;
        const r2 = returnsBySymbol.get(s2) ?? [];
        const mean2 = r2.reduce((acc, v) => acc + v, 0) / (r2.length || 1);

        let cov = 0;
        let var1 = 0;
        let var2 = 0;

        for (let k = 0; k < r1.length; k++) {
          const d1 = (r1[k] ?? 0) - mean1;
          const d2 = (r2[k] ?? 0) - mean2;
          cov += d1 * d2;
          var1 += d1 * d1;
          var2 += d2 * d2;
        }

        const denom = Math.sqrt(var1 * var2);
        const corr = denom > 1e-12 ? Math.max(-1, Math.min(1, cov / denom)) : 0;
        const roundedCorr = Math.round(corr * 1000) / 1000;
        matrix[i]![j] = roundedCorr;

        if (i < j) {
          pairSum += roundedCorr;
          pairCount += 1;
        }
      }
    }

    const avgPairwise = pairCount > 0 ? Math.round((pairSum / pairCount) * 1000) / 1000 : 0;

    return {
      symbols,
      matrix,
      avgPairwiseCorrelation: avgPairwise,
      sampleCount: this.observations.length,
    };
  }
}

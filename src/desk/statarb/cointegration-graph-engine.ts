/**
 * Cointegration Graph & Asset Cluster Engine
 * Computes asset pair cointegration residuals, OLS hedge ratios, and Minimum Spanning Tree (MST) distance graphs.
 *
 * @module desk/statarb/cointegration-graph-engine
 */

import {
  PairPriceSeries,
  CointegrationPairResult,
  GraphEdge,
} from './statarb-types';
import { OrnsteinUhlenbeckCalibrator } from './ornstein-uhlenbeck-calibrator';

export class CointegrationGraphEngine {
  private ouCalibrator = new OrnsteinUhlenbeckCalibrator();

  /**
   * Tests pair for cointegration and calibrates OU dynamics on residual spread.
   */
  public analyzePair(pair: PairPriceSeries): CointegrationPairResult {
    const { symbolA, symbolB, pricesA, pricesB } = pair;
    if (pricesA.length !== pricesB.length || pricesA.length < 10) {
      throw new Error('Price series must have identical length of at least 10 observations');
    }

    const N = pricesA.length;
    // OLS regression: pricesA = intercept + hedgeRatio * pricesB
    let sumA = 0;
    let sumB = 0;
    let sumBB = 0;
    let sumBA = 0;

    for (let i = 0; i < N; i++) {
      const pa = pricesA[i]!;
      const pb = pricesB[i]!;
      sumA += pa;
      sumB += pb;
      sumBB += pb * pb;
      sumBA += pb * pa;
    }

    const denom = N * sumBB - sumB * sumB;
    if (Math.abs(denom) < 1e-12) {
      throw new Error('Prices B has zero variance');
    }

    const hedgeRatio = (N * sumBA - sumB * sumA) / denom;
    const intercept = (sumA - hedgeRatio * sumB) / N;

    // Compute residual spread series
    const residualSpread: number[] = [];
    for (let i = 0; i < N; i++) {
      residualSpread.push(pricesA[i]! - (intercept + hedgeRatio * pricesB[i]!));
    }

    const ouParameters = this.ouCalibrator.calibrate(residualSpread);

    // Cointegration criterion: positive theta, half-life bounded and finite
    const isCointegrated = ouParameters.theta > 0.01 && ouParameters.halfLifePeriods < N;

    return {
      symbolA,
      symbolB,
      hedgeRatio: Number(hedgeRatio.toFixed(6)),
      intercept: Number(intercept.toFixed(6)),
      residualSpread,
      ouParameters,
      isCointegrated,
    };
  }

  /**
   * Builds Minimum Spanning Tree (MST) over asset correlation distance metric d = sqrt(2*(1 - rho)).
   */
  public computeMinimumSpanningTree(assetReturns: { [symbol: string]: number[] }): GraphEdge[] {
    const symbols = Object.keys(assetReturns);
    if (symbols.length < 2) return [];

    const allEdges: GraphEdge[] = [];

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const sA = symbols[i]!;
        const sB = symbols[j]!;
        const corr = this.computeCorrelation(assetReturns[sA]!, assetReturns[sB]!);
        const dist = Math.sqrt(Math.max(0, 2 * (1 - corr)));
        allEdges.push({ source: sA, target: sB, distance: dist, correlation: corr });
      }
    }

    // Kruskal's algorithm for MST
    allEdges.sort((a, b) => a.distance - b.distance);

    const parent: { [key: string]: string } = {};
    for (const sym of symbols) parent[sym] = sym;

    const find = (i: string): string => {
      if (parent[i] === i) return i;
      parent[i] = find(parent[i]!);
      return parent[i]!;
    };

    const mst: GraphEdge[] = [];
    for (const edge of allEdges) {
      const root1 = find(edge.source);
      const root2 = find(edge.target);
      if (root1 !== root2) {
        mst.push(edge);
        parent[root1] = root2;
        if (mst.length === symbols.length - 1) break;
      }
    }

    return mst;
  }

  private computeCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let cov = 0;
    let varX = 0;
    let varY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i]! - mx;
      const dy = y[i]! - my;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const denom = Math.sqrt(varX * varY);
    if (denom === 0) return 0;
    return cov / denom;
  }
}

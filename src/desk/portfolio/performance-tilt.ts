import {
  ENGINE_IDS,
  EngineId,
  MarketRegime,
  StrategyPerformance,
} from './types';
import {
  REGIME_AFFINITY_MATRIX,
  computeSharpe,
  computeSortino,
  projectBudgetsWaterFilling,
} from './performance-tilt-math';

export { REGIME_AFFINITY_MATRIX, computeSharpe, computeSortino };

export interface PerformanceTiltOptions {
  readonly gammaTilt?: number;
  readonly minRiskBudget?: number;
  readonly maxRiskBudget?: number;
  readonly riskFreeRate?: number;
  readonly annualizationFactor?: number;
}

export class PerformanceTiltEngine {
  private readonly gamma: number;
  private readonly minBudget: number;
  private readonly maxBudget: number;
  private readonly rf: number;
  private readonly ann: number;

  constructor(options: PerformanceTiltOptions = {}) {
    this.gamma = options.gammaTilt ?? 0.35;
    this.minBudget = options.minRiskBudget ?? 0.05;
    this.maxBudget = options.maxRiskBudget ?? 0.50;
    this.rf = options.riskFreeRate ?? 0.04;
    this.ann = options.annualizationFactor ?? 365;
  }

  public computeMetrics(
    engineId: EngineId,
    returns: readonly number[],
    totalPnlUsd = 0
  ): StrategyPerformance {
    const rollingSharpe = computeSharpe(returns, this.rf, this.ann);
    const rollingSortino = computeSortino(returns, this.rf, this.ann);
    const mean = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance =
      returns.length > 1
        ? returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1)
        : 0;
    const rollingVolatility = Math.sqrt(variance) * Math.sqrt(this.ann);

    return {
      engineId,
      rollingSharpe,
      rollingSortino,
      rollingVolatility,
      totalPnlUsd,
    };
  }

  public computeTiltedBudgets(
    performance: Readonly<Record<EngineId, StrategyPerformance>>,
    regime: MarketRegime
  ): Record<EngineId, number> {
    const scores: Record<EngineId, number> = {} as Record<EngineId, number>;
    for (const id of ENGINE_IDS) {
      const p = performance[id];
      const clampedSharpe = Math.max(-2.0, Math.min(4.0, p?.rollingSharpe ?? 0));
      const clampedSortino = Math.max(-2.0, Math.min(5.0, p?.rollingSortino ?? 0));
      scores[id] = 0.5 * clampedSharpe + 0.5 * clampedSortino;
    }

    const meanScore =
      ENGINE_IDS.reduce((sum, id) => sum + scores[id], 0) / ENGINE_IDS.length;
    const scoreVar =
      ENGINE_IDS.reduce((sum, id) => sum + (scores[id] - meanScore) ** 2, 0) /
      ENGINE_IDS.length;
    const scoreStd = Math.sqrt(scoreVar);

    const regimeMultipliers = REGIME_AFFINITY_MATRIX[regime];
    const rawTilts: Record<EngineId, number> = {} as Record<EngineId, number>;

    for (const id of ENGINE_IDS) {
      const zScore = (scores[id] - meanScore) / (scoreStd + 1e-6);
      const mRegime = regimeMultipliers[id] ?? 1.0;
      rawTilts[id] = Math.exp(this.gamma * zScore) * mRegime;
    }

    return projectBudgetsWaterFilling(rawTilts, this.minBudget, this.maxBudget);
  }
}

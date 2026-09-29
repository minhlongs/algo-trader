import {
  ENGINE_IDS,
  EngineId,
  MarketRegime,
  StrategyPerformance,
} from './types';

export const REGIME_AFFINITY_MATRIX: Readonly<Record<MarketRegime, Readonly<Record<EngineId, number>>>> = {
  HIGH_VOLATILITY: {
    arbitrage: 1.35,
    marl: 0.65,
    amm: 0.85,
    'alpha-lab': 1.15,
  },
  RANGING: {
    arbitrage: 0.90,
    marl: 1.40,
    amm: 1.20,
    'alpha-lab': 0.70,
  },
  TRENDING: {
    arbitrage: 1.00,
    marl: 0.80,
    amm: 0.90,
    'alpha-lab': 1.45,
  },
  LOW_LIQUIDITY: {
    arbitrage: 1.25,
    marl: 0.60,
    amm: 0.70,
    'alpha-lab': 0.85,
  },
};

export interface PerformanceTiltOptions {
  readonly gammaTilt?: number;
  readonly minRiskBudget?: number;
  readonly maxRiskBudget?: number;
  readonly riskFreeRate?: number;
  readonly annualizationFactor?: number;
}

export function computeSharpe(
  returns: readonly number[],
  rf = 0.04,
  ann = 365
): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdev = Math.sqrt(Math.max(variance, 0));
  if (stdev < 1e-8) return 0;
  const dailyRf = rf / ann;
  return ((mean - dailyRf) / stdev) * Math.sqrt(ann);
}

export function computeSortino(
  returns: readonly number[],
  rf = 0.04,
  ann = 365
): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const dailyRf = rf / ann;
  const downsideSquared = returns.reduce((sum, r) => {
    const diff = r - dailyRf;
    return diff < 0 ? sum + diff * diff : sum;
  }, 0);
  const downsideDev = Math.sqrt(downsideSquared / returns.length);
  if (downsideDev < 1e-6) {
    return mean >= dailyRf ? 5.0 : -2.0;
  }
  return ((mean - dailyRf) / downsideDev) * Math.sqrt(ann);
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

    // Exact water-filling projection onto [minBudget, maxBudget] with sum = 1.0
    const result: Record<EngineId, number> = {} as Record<EngineId, number>;
    let remainingBudget = 1.0;
    let activeIds: EngineId[] = [...ENGINE_IDS];

    while (activeIds.length > 0) {
      const activeRawSum = activeIds.reduce((sum, id) => sum + rawTilts[id], 0);
      let maxViolation = 0;
      let violatingId: EngineId | null = null;
      let fixValue = 0;

      for (const id of activeIds) {
        const share =
          activeRawSum > 0
            ? (rawTilts[id] / activeRawSum) * remainingBudget
            : remainingBudget / activeIds.length;

        if (share > this.maxBudget && share - this.maxBudget > maxViolation) {
          maxViolation = share - this.maxBudget;
          violatingId = id;
          fixValue = this.maxBudget;
        } else if (share < this.minBudget && this.minBudget - share > maxViolation) {
          maxViolation = this.minBudget - share;
          violatingId = id;
          fixValue = this.minBudget;
        }
      }

      if (violatingId === null || maxViolation <= 1e-6) {
        for (const id of activeIds) {
          result[id] =
            activeRawSum > 0
              ? (rawTilts[id] / activeRawSum) * remainingBudget
              : remainingBudget / activeIds.length;
        }
        break;
      }

      result[violatingId] = fixValue;
      remainingBudget -= fixValue;
      activeIds = activeIds.filter((id) => id !== violatingId);
    }

    return result;
  }
}

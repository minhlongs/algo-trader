import {
  ENGINE_IDS,
  EngineId,
  MarketRegime,
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

/**
 * Exact water-filling projection onto [minBudget, maxBudget] with sum = 1.0
 */
export function projectBudgetsWaterFilling(
  rawTilts: Readonly<Record<EngineId, number>>,
  minBudget: number,
  maxBudget: number
): Record<EngineId, number> {
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

      if (share > maxBudget && share - maxBudget > maxViolation) {
        maxViolation = share - maxBudget;
        violatingId = id;
        fixValue = maxBudget;
      } else if (share < minBudget && minBudget - share > maxViolation) {
        maxViolation = minBudget - share;
        violatingId = id;
        fixValue = minBudget;
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

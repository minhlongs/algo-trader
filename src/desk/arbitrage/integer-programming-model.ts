/**
 * Integer Programming Model Builder & Result Parser
 * Pure LP model construction and solution parsing helpers for multi-market arbitrage.
 */

import type { Model } from 'javascript-lp-solver';
import type { ILPResult, ILPSolverConfig, MarketOpportunity } from '../../shared/types/ilp-types';
import { buildConstraints } from './ilp-constraint-builder';

export const yesKey = (marketId: string): string => `${marketId}_YES`;
export const noKey = (marketId: string): string => `${marketId}_NO`;

/**
 * Construct the LP model JSON for javascript-lp-solver from eligible markets.
 * Each market contributes two variables (YES and NO position sizes).
 */
export function buildModel(markets: MarketOpportunity[], config: ILPSolverConfig): Model {
  const constraints = buildConstraints(markets, config);
  const variables: Model['variables'] = {};

  for (const market of markets) {
    const netEdge = market.expectedEdge - config.feeRate;
    const sizeCapUsdc = Math.min(
      market.liquidity,
      config.budgetUsdc * config.maxMarketExposureFraction,
    );

    if (sizeCapUsdc <= 0 || netEdge <= 0) continue;

    variables[yesKey(market.marketId)] = {
      profit: netEdge,
      budget: 1,
      [`market_${market.marketId}_max`]: 1,
    };

    variables[noKey(market.marketId)] = {
      profit: netEdge,
      budget: 1,
      [`market_${market.marketId}_max`]: 1,
    };
  }

  return {
    optimize: 'profit',
    opType: 'max',
    constraints,
    variables,
    timeout: config.timeoutMs,
  };
}

/** Parse solver output into structured ILPResult */
export function parseResult(
  solverOutput: Record<string, number | boolean | undefined>,
  markets: MarketOpportunity[],
  config: ILPSolverConfig,
  startMs: number,
): ILPResult {
  const feasible = Boolean(solverOutput.feasible);
  const positions: ILPResult['positions'] = [];
  let totalCost = 0;
  let totalExpectedProfit = 0;

  if (feasible) {
    const netEdgeMap = new Map(
      markets.map(m => [m.marketId, m.expectedEdge - config.feeRate]),
    );

    for (const market of markets) {
      const netEdge = netEdgeMap.get(market.marketId) ?? 0;

      const yesSize = Number(solverOutput[yesKey(market.marketId)] ?? 0);
      if (yesSize > 0.001) {
        const profit = yesSize * netEdge;
        positions.push({ marketId: market.marketId, side: 'YES', size: yesSize, expectedProfit: profit });
        totalCost += yesSize;
        totalExpectedProfit += profit;
      }

      const noSize = Number(solverOutput[noKey(market.marketId)] ?? 0);
      if (noSize > 0.001) {
        const profit = noSize * netEdge;
        positions.push({ marketId: market.marketId, side: 'NO', size: noSize, expectedProfit: profit });
        totalCost += noSize;
        totalExpectedProfit += profit;
      }
    }
  }

  return {
    positions,
    totalExpectedProfit,
    totalCost,
    feasible,
    solveTimeMs: Date.now() - startMs,
  };
}

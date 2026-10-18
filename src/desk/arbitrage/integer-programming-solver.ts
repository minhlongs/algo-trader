/**
 * Integer Programming Solver — Core ILP Formulation
 *
 * Wraps javascript-lp-solver (JSON model format) to solve multi-market
 * arbitrage allocation. Maximizes expected profit subject to budget
 * and per-market exposure constraints.
 *
 * Model structure:
 *   - Objective: maximize Σ edge_i * size_{i,side}
 *   - Variables: size_{marketId}_YES, size_{marketId}_NO (continuous, ≥ 0)
 *   - Constraints: budget (Σ sizes ≤ budget), per-market-max (each market ≤ 20% budget)
 */

import solver from 'javascript-lp-solver';
import { logger } from '../../shared/utils/logger';
import type { ILPResult, ILPSolverConfig, MarketOpportunity } from '../../shared/types/ilp-types';
import { filterEligibleMarkets } from './ilp-constraint-builder';
import { buildModel, parseResult, yesKey, noKey } from './integer-programming-model';

export { buildModel, parseResult, yesKey, noKey };

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Solve the multi-market arbitrage ILP.
 *
 * Returns an ILPResult with optimal position allocations.
 * Returns feasible=false if no profitable allocation exists within constraints.
 */
export function solveILP(
  markets: MarketOpportunity[],
  config: ILPSolverConfig
): ILPResult {
  const startMs = Date.now();

  const eligible = filterEligibleMarkets(markets, config);

  if (eligible.length === 0) {
    logger.info('[ILPSolver] No eligible markets — all below min edge threshold');
    return { positions: [], totalExpectedProfit: 0, totalCost: 0, feasible: false, solveTimeMs: 0 };
  }

  logger.debug('[ILPSolver] Solving ILP', { markets: eligible.length, budget: config.budgetUsdc });

  try {
    const model = buildModel(eligible, config);
    const rawResult = solver.Solve(model) as Record<string, number | boolean | undefined>;

    const result = parseResult(rawResult, eligible, config, startMs);

    logger.info('[ILPSolver] Solve complete', {
      feasible: result.feasible,
      positions: result.positions.length,
      profit: result.totalExpectedProfit.toFixed(4),
      cost: result.totalCost.toFixed(2),
      solveTimeMs: result.solveTimeMs,
    });

    return result;
  } catch (err) {
    logger.error('[ILPSolver] Solver error', { error: err instanceof Error ? err.message : String(err) });
    return { positions: [], totalExpectedProfit: 0, totalCost: 0, feasible: false, solveTimeMs: Date.now() - startMs };
  }
}

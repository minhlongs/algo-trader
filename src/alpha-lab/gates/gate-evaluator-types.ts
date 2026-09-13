/**
 * Gate Evaluator — Input types and interface definitions.
 */

import type { BacktestTrade } from '../../desk/backtesting/types';
import type { StatisticalSignificanceInput } from '../validation/validation-types';

export interface GateEvaluatorInput {
  /** Paper trades from the paper trading loop */
  trades: BacktestTrade[];
  /** ISO timestamp of when paper trading started */
  startDate: string;
  /** Equity curve for drawdown/sharpe computation */
  equityCurve: Array<{ timestamp: string; equity: number }>;
  /** Optional: test window win rate for OOS consistency check */
  testWinRate?: number;
  /** Optional: validation window win rate for OOS consistency check */
  valWinRate?: number;
  /** Boolean flags for manual/boolean gates */
  flags?: {
    kellyWired?: boolean;
    circuitBreakerTested?: boolean;
    exchangeConnectivityGreen?: boolean;
  };
  /**
   * Optional precomputed statistical validation outputs (Monte Carlo p-value +
   * bootstrap Sharpe CI). When omitted the statistical_significance gate is
   * not evaluated — existing callers see the same 10 gates as before.
   */
  statisticalValidation?: StatisticalSignificanceInput;
}

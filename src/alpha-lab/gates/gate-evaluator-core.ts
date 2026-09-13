/**
 * Gate Evaluator — Core evaluation orchestrator.
 */

import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { GateStatus, PromotionReadiness } from './gate-types';
import type { GateEvaluatorInput } from './gate-evaluator-types';
import {
  evaluateNumericGate,
  evaluateOosGate,
  evaluateBooleanGate,
  evaluateStatisticalGate,
  computeDaysSinceStart,
  computeOosGap,
  estimateDaysRemaining,
} from './gate-evaluator-rules';

/**
 * Evaluate all 10 transition-criteria gates against current paper trading data.
 */
export function evaluateGates(input: GateEvaluatorInput): PromotionReadiness {
  const metrics = computeMetrics(input.trades, input.equityCurve);
  const daysSinceStart = computeDaysSinceStart(input.startDate);
  const oosGap = computeOosGap(input.testWinRate, input.valWinRate);
  const flags = input.flags ?? {};

  const gates: GateStatus[] = [
    evaluateNumericGate('duration', daysSinceStart),
    evaluateNumericGate('trade_count', metrics.totalTrades),
    evaluateNumericGate('win_rate', metrics.winRate),
    evaluateNumericGate('profit_factor', metrics.profitFactor),
    evaluateNumericGate('max_drawdown', Math.abs(metrics.maxDrawdown)),
    evaluateNumericGate('sharpe_ratio', metrics.sharpeRatio),
    evaluateOosGate(oosGap),
    evaluateBooleanGate('kelly_wired', flags.kellyWired ?? false),
    evaluateBooleanGate('circuit_breaker', flags.circuitBreakerTested ?? false),
    evaluateBooleanGate(
      'exchange_connectivity',
      flags.exchangeConnectivityGreen ?? false,
    ),
  ];

  if (input.statisticalValidation) {
    gates.push(evaluateStatisticalGate(input.statisticalValidation));
  }

  const passedCount = gates.filter((g) => g.passed).length;
  const allPassed = passedCount === gates.length;
  const estimatedDays = estimateDaysRemaining(gates, daysSinceStart);

  return {
    evaluatedAt: new Date().toISOString(),
    gates,
    allPassed,
    passedCount,
    totalGates: gates.length,
    estimatedDaysRemaining: estimatedDays,
  };
}

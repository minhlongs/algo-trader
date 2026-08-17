/**
 * Gate Evaluator
 *
 * Loads paper trades, computes metrics via computeMetrics, then checks
 * all 10 transition-criteria gates from docs/transition-criteria.md.
 * Returns structured GateStatus per gate with pass/fail and current value.
 */

import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import type {
  GateId,
  GateStatus,
  PromotionReadiness,
} from './gate-types';
import { GATE_THRESHOLDS } from './gate-types';

// ── Input Types ────────────────────────────────────────────────────────────────

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
}

// ── Public API ─────────────────────────────────────────────────────────────────

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

// ── Internal Helpers ───────────────────────────────────────────────────────────

function evaluateNumericGate(id: GateId, currentValue: number): GateStatus {
  const meta = GATE_THRESHOLDS.find((g) => g.id === id)!;
  if (!meta.threshold || !meta.direction) {
    throw new Error(`Gate "${id}" is not a numeric gate`);
  }

  const passed =
    meta.direction === 'at_least'
      ? currentValue >= meta.threshold
      : currentValue <= meta.threshold;

  return {
    id: meta.id,
    name: meta.name,
    currentValue,
    threshold: meta.threshold,
    passed,
    details: passed
      ? `PASS: ${formatValue(id, currentValue)} ${meta.direction === 'at_least' ? '>=' : '<='} ${formatValue(id, meta.threshold)}`
      : `FAIL: ${formatValue(id, currentValue)} ${meta.direction === 'at_least' ? '<' : '>'} ${formatValue(id, meta.threshold)}`,
  };
}

function evaluateOosGate(oosGap: number | null): GateStatus {
  const meta = GATE_THRESHOLDS.find((g) => g.id === 'oos_consistency')!;
  if (oosGap === null) {
    return {
      id: meta.id,
      name: meta.name,
      currentValue: null,
      threshold: meta.threshold,
      passed: false,
      details: 'SKIP: testWinRate / valWinRate not provided',
    };
  }
  const passed = oosGap <= 0.05;
  return {
    id: meta.id,
    name: meta.name,
    currentValue: oosGap,
    threshold: meta.threshold,
    passed,
    details: passed
      ? `PASS: OOS gap ${oosGap.toFixed(4)} <= 0.05`
      : `FAIL: OOS gap ${oosGap.toFixed(4)} > 0.05`,
  };
}

function evaluateBooleanGate(id: GateId, value: boolean): GateStatus {
  const meta = GATE_THRESHOLDS.find((g) => g.id === id)!;
  return {
    id: meta.id,
    name: meta.name,
    currentValue: value ? 1 : 0,
    threshold: null,
    passed: value,
    details: value ? `PASS: ${meta.name}` : `FAIL: ${meta.name} not confirmed`,
  };
}

function computeDaysSinceStart(startDate: string): number {
  const start = new Date(startDate).getTime();
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((now - start) / msPerDay);
}

function computeOosGap(
  testWinRate: number | undefined,
  valWinRate: number | undefined,
): number | null {
  if (testWinRate === undefined || valWinRate === undefined) return null;
  return valWinRate - testWinRate;
}

function estimateDaysRemaining(
  gates: GateStatus[],
  daysSinceStart: number,
): number | null {
  const durationGate = gates.find((g) => g.id === 'duration');
  if (!durationGate) return null;
  if (durationGate.passed) return 0;
  const remaining = 30 - daysSinceStart;
  return remaining > 0 ? remaining : 0;
}

function formatValue(id: GateId, value: number): string {
  if (id === 'win_rate') return `${(value * 100).toFixed(1)}%`;
  if (id === 'max_drawdown') return `${(value * 100).toFixed(1)}%`;
  if (id === 'oos_consistency') return value.toFixed(4);
  return String(Math.round(value * 100) / 100);
}


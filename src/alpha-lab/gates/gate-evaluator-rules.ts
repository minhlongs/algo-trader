/**
 * Gate Evaluator — Rule-specific evaluation routines and formatters.
 */

import type { StatisticalSignificanceInput } from '../validation/validation-types';
import type { GateId, GateStatus } from './gate-types';
import { GATE_THRESHOLDS } from './gate-types';

export function evaluateNumericGate(id: GateId, currentValue: number): GateStatus {
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

export function evaluateOosGate(oosGap: number | null): GateStatus {
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

export function evaluateBooleanGate(id: GateId, value: boolean): GateStatus {
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

export const STATISTICAL_P_VALUE_THRESHOLD = 0.05;

/**
 * Optional gate: Monte Carlo p-value < 0.05 AND bootstrap Sharpe CI lower
 * bound > 0. Kept out of GATE_THRESHOLDS so legacy consumers still see the
 * original 10 transition gates.
 */
export function evaluateStatisticalGate(stats: StatisticalSignificanceInput): GateStatus {
  const { pValueSharpe, sharpeCiLower } = stats;

  if (!Number.isFinite(pValueSharpe) || !Number.isFinite(sharpeCiLower)) {
    return {
      id: 'statistical_significance',
      name: 'Statistical Significance',
      currentValue: null,
      threshold: STATISTICAL_P_VALUE_THRESHOLD,
      passed: false,
      details: 'FAIL: statistical validation inputs must be finite numbers',
    };
  }

  const pValueOk = pValueSharpe < STATISTICAL_P_VALUE_THRESHOLD;
  const ciOk = sharpeCiLower > 0;
  const passed = pValueOk && ciOk;

  const reasons: string[] = [];
  if (!pValueOk) reasons.push(`p-value ${pValueSharpe.toFixed(4)} >= ${STATISTICAL_P_VALUE_THRESHOLD}`);
  if (!ciOk) reasons.push(`Sharpe CI lower bound ${sharpeCiLower.toFixed(4)} <= 0`);

  return {
    id: 'statistical_significance',
    name: 'Statistical Significance',
    currentValue: pValueSharpe,
    threshold: STATISTICAL_P_VALUE_THRESHOLD,
    passed,
    details: passed
      ? `PASS: p-value ${pValueSharpe.toFixed(4)} < ${STATISTICAL_P_VALUE_THRESHOLD} and Sharpe CI lower bound ${sharpeCiLower.toFixed(4)} > 0`
      : `FAIL: ${reasons.join('; ')}`,
  };
}

export function computeDaysSinceStart(startDate: string): number {
  const start = new Date(startDate).getTime();
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((now - start) / msPerDay);
}

export function computeOosGap(
  testWinRate: number | undefined,
  valWinRate: number | undefined,
): number | null {
  if (testWinRate === undefined || valWinRate === undefined) return null;
  return valWinRate - testWinRate;
}

export function estimateDaysRemaining(
  gates: GateStatus[],
  daysSinceStart: number,
): number | null {
  const durationGate = gates.find((g) => g.id === 'duration');
  if (!durationGate) return null;
  if (durationGate.passed) return 0;
  const remaining = 30 - daysSinceStart;
  return remaining > 0 ? remaining : 0;
}

export function formatValue(id: GateId, value: number): string {
  if (id === 'win_rate') return `${(value * 100).toFixed(1)}%`;
  if (id === 'max_drawdown') return `${(value * 100).toFixed(1)}%`;
  if (id === 'oos_consistency') return value.toFixed(4);
  return String(Math.round(value * 100) / 100);
}

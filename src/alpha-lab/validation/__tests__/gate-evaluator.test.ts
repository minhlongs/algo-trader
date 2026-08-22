import { describe, it, expect } from 'vitest';
import { evaluateGates } from '../../gates/gate-evaluator';
import type { GateEvaluatorInput } from '../../gates/gate-evaluator';
import type { BacktestTrade } from '../../../desk/backtesting/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeTrades(pnls: number[]): BacktestTrade[] {
  return pnls.map((pnl, i) => ({
    strategy: 'test-strategy',
    entryPrice: 100,
    exitPrice: 100 + pnl,
    pnl,
    entryTime: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    exitTime: new Date(Date.UTC(2025, 0, i + 2)).toISOString(),
    side: (pnl >= 0 ? 'buy' : 'sell') as 'buy' | 'sell',
    conditionId: `market-${i}`,
    question: `Test market ${i}`,
    size: 10,
  }));
}

function makeEquityCurve(pnls: number[]): Array<{ timestamp: string; equity: number }> {
  let equity = 1000;
  return pnls.map((pnl, i) => {
    equity += pnl;
    return { timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(), equity };
  });
}

function baseInput(pnls: number[]): GateEvaluatorInput {
  return {
    trades: makeTrades(pnls),
    startDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    equityCurve: makeEquityCurve(pnls),
    testWinRate: 0.60,
    valWinRate: 0.58,
    flags: {
      kellyWired: true,
      circuitBreakerTested: true,
      exchangeConnectivityGreen: true,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('gate-evaluator statistical_significance (additive, off-by-default)', () => {
  it('keeps the original 10 gates when statisticalValidation is omitted', () => {
    const reading = evaluateGates(baseInput([10, 10, 10, 10, 10]));
    expect(reading.gates).toHaveLength(10);
    expect(reading.totalGates).toBe(10);
    expect(reading.gates.find((g) => g.id === 'statistical_significance')).toBeUndefined();
  });

  it('adds an 11th gate when statisticalValidation is provided', () => {
    const reading = evaluateGates({
      ...baseInput([10, 10, 10, 10, 10]),
      statisticalValidation: { pValueSharpe: 0.01, sharpeCiLower: 0.5 },
    });
    expect(reading.gates).toHaveLength(11);
    expect(reading.totalGates).toBe(11);
    const gate = reading.gates.find((g) => g.id === 'statistical_significance')!;
    expect(gate).toBeDefined();
    expect(gate.passed).toBe(true);
  });

  it('fails the gate when p-value is not below 0.05', () => {
    const reading = evaluateGates({
      ...baseInput([10, 10, 10, 10, 10]),
      statisticalValidation: { pValueSharpe: 0.1, sharpeCiLower: 0.5 },
    });
    const gate = reading.gates.find((g) => g.id === 'statistical_significance')!;
    expect(gate.passed).toBe(false);
    expect(gate.currentValue).toBe(0.1);
    expect(gate.details).toContain('p-value 0.1000 >= 0.05');
  });

  it('fails the gate when Sharpe CI lower bound is not above 0', () => {
    const reading = evaluateGates({
      ...baseInput([10, 10, 10, 10, 10]),
      statisticalValidation: { pValueSharpe: 0.01, sharpeCiLower: -0.2 },
    });
    const gate = reading.gates.find((g) => g.id === 'statistical_significance')!;
    expect(gate.passed).toBe(false);
    expect(gate.details).toContain('Sharpe CI lower bound -0.2000 <= 0');
  });

  it('fails the gate when both conditions fail', () => {
    const reading = evaluateGates({
      ...baseInput([10, 10, 10, 10, 10]),
      statisticalValidation: { pValueSharpe: 0.5, sharpeCiLower: -1.0 },
    });
    const gate = reading.gates.find((g) => g.id === 'statistical_significance')!;
    expect(gate.passed).toBe(false);
    expect(gate.details).toContain('p-value 0.5000 >= 0.05');
    expect(gate.details).toContain('Sharpe CI lower bound -1.0000 <= 0');
  });

  it('fails the gate for non-finite inputs', () => {
    const reading = evaluateGates({
      ...baseInput([10, 10, 10, 10, 10]),
      statisticalValidation: { pValueSharpe: NaN, sharpeCiLower: 0.5 },
    });
    const gate = reading.gates.find((g) => g.id === 'statistical_significance')!;
    expect(gate.passed).toBe(false);
    expect(gate.currentValue).toBeNull();
    expect(gate.details).toContain('finite');
  });

  it('does not break allPassed semantics when the new gate is added', () => {
    const reading = evaluateGates({
      ...baseInput([10, 10, 10, 10, 10]),
      statisticalValidation: { pValueSharpe: 0.01, sharpeCiLower: 0.5 },
    });
    // New gate passes here; allPassed still reflects the aggregate.
    expect(typeof reading.allPassed).toBe('boolean');
    expect(reading.passedCount).toBeGreaterThanOrEqual(10);
    expect(reading.passedCount).toBeLessThanOrEqual(11);
  });
});
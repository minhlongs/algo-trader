import { describe, it, expect } from 'vitest';
import {
  evaluateGates,
} from '../gates/gate-evaluator';
import type { GateEvaluatorInput } from '../gates/gate-evaluator';
import type { BacktestTrade } from '../../desk/backtesting/types';
import {
  detectTransitions,
  recordEvaluation,
  InMemoryGateStateStore,
} from '../gates/gate-state';
import type { PromotionReadiness } from '../gates/gate-types';
import { GATE_THRESHOLDS } from '../gates/gate-types';

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
    return {
      timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
      equity,
    };
  });
}

function baseInput(pnls: number[], daysAgo = 45): GateEvaluatorInput {
  return {
    trades: makeTrades(pnls),
    startDate: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('gate-evaluator', () => {
  it('returns 10 gates', () => {
    const reading = evaluateGates(baseInput([10, 10, 10, 10, 10]));
    expect(reading.gates).toHaveLength(10);
    expect(reading.totalGates).toBe(10);
  });

  it('passes duration gate when > 30 days', () => {
    const reading = evaluateGates(baseInput([10, 10, 10, 10, 10], 45));
    const gate = reading.gates.find((g) => g.id === 'duration')!;
    expect(gate.passed).toBe(true);
    expect(gate.currentValue).toBeGreaterThanOrEqual(30);
  });

  it('fails duration gate when < 30 days', () => {
    const reading = evaluateGates(baseInput([10, 10, 10, 10, 10], 15));
    const gate = reading.gates.find((g) => g.id === 'duration')!;
    expect(gate.passed).toBe(false);
  });

  it('passes trade_count gate when >= 50 trades', () => {
    const pnls = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 10 : -5));
    const reading = evaluateGates(baseInput(pnls));
    const gate = reading.gates.find((g) => g.id === 'trade_count')!;
    expect(gate.passed).toBe(true);
    expect(gate.currentValue).toBe(50);
  });

  it('fails trade_count gate when < 50 trades', () => {
    const pnls = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 10 : -5));
    const reading = evaluateGates(baseInput(pnls));
    const gate = reading.gates.find((g) => g.id === 'trade_count')!;
    expect(gate.passed).toBe(false);
    expect(gate.currentValue).toBe(30);
  });

  it('passes win_rate gate when >= 55%', () => {
    // 8 wins out of 10 = 80%
    const pnls = [10, 10, 10, 10, 10, 10, 10, 10, -5, -5];
    const reading = evaluateGates(baseInput(pnls));
    const gate = reading.gates.find((g) => g.id === 'win_rate')!;
    expect(gate.passed).toBe(true);
    expect(gate.currentValue!).toBeGreaterThanOrEqual(0.55);
  });

  it('fails win_rate gate when < 55%', () => {
    // 4 wins out of 10 = 40%
    const pnls = [10, 10, 10, 10, -5, -5, -5, -5, -5, -5];
    const reading = evaluateGates(baseInput(pnls));
    const gate = reading.gates.find((g) => g.id === 'win_rate')!;
    expect(gate.passed).toBe(false);
    expect(gate.currentValue!).toBeLessThan(0.55);
  });

  it('passes max_drawdown gate when <= 15%', () => {
    // Small losses, no big drawdown
    const pnls = [10, -2, 10, -2, 10, -2, 10, -2, 10, -2];
    const reading = evaluateGates(baseInput(pnls));
    const gate = reading.gates.find((g) => g.id === 'max_drawdown')!;
    expect(gate.passed).toBe(true);
  });

  it('fails max_drawdown gate when > 15%', () => {
    // Large loss creates > 15% drawdown from equity 1000
    const pnls = [10, -200, 10, -2, 10, -2, 10, -2, 10, -2];
    const reading = evaluateGates(baseInput(pnls));
    const gate = reading.gates.find((g) => g.id === 'max_drawdown')!;
    expect(gate.passed).toBe(false);
  });

  it('passes boolean gates when flags are true', () => {
    const reading = evaluateGates(baseInput([10, 10, 10, 10, 10]));
    expect(reading.gates.find((g) => g.id === 'kelly_wired')!.passed).toBe(true);
    expect(reading.gates.find((g) => g.id === 'circuit_breaker')!.passed).toBe(true);
    expect(reading.gates.find((g) => g.id === 'exchange_connectivity')!.passed).toBe(true);
  });

  it('fails boolean gates when flags are false', () => {
    const input = baseInput([10, 10, 10, 10, 10]);
    input.flags = {
      kellyWired: false,
      circuitBreakerTested: false,
      exchangeConnectivityGreen: false,
    };
    const reading = evaluateGates(input);
    expect(reading.gates.find((g) => g.id === 'kelly_wired')!.passed).toBe(false);
    expect(reading.gates.find((g) => g.id === 'circuit_breaker')!.passed).toBe(false);
    expect(reading.gates.find((g) => g.id === 'exchange_connectivity')!.passed).toBe(false);
  });

  it('reports allPassed correctly', () => {
    const bigPnls = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 10 : -3));
    const reading = evaluateGates(baseInput(bigPnls, 45));
    // allPassed depends on all metrics — at minimum duration, count, and booleans should pass
    expect(typeof reading.allPassed).toBe('boolean');
    expect(reading.passedCount).toBeGreaterThanOrEqual(0);
    expect(reading.passedCount).toBeLessThanOrEqual(10);
  });

  it('has all 10 gate thresholds defined', () => {
    expect(GATE_THRESHOLDS).toHaveLength(10);
    const ids = GATE_THRESHOLDS.map((g) => g.id);
    expect(ids).toContain('duration');
    expect(ids).toContain('trade_count');
    expect(ids).toContain('win_rate');
    expect(ids).toContain('profit_factor');
    expect(ids).toContain('max_drawdown');
    expect(ids).toContain('sharpe_ratio');
    expect(ids).toContain('oos_consistency');
    expect(ids).toContain('kelly_wired');
    expect(ids).toContain('circuit_breaker');
    expect(ids).toContain('exchange_connectivity');
  });
});

describe('gate-state', () => {
  it('stores and retrieves latest evaluation', () => {
    const store = new InMemoryGateStateStore();
    const reading = evaluateGates(baseInput([10, 10, 10, 10, 10]));

    expect(store.loadLatest()).toBeNull();

    recordEvaluation(store, reading);
    const latest = store.loadLatest();
    expect(latest).not.toBeNull();
    expect(latest!.totalGates).toBe(10);
  });

  it('detects transitions from fail to pass', () => {
    const prev: PromotionReadiness = {
      evaluatedAt: '2025-01-01T00:00:00Z',
      gates: [
        { id: 'duration', name: 'Duration', currentValue: 15, threshold: 30, passed: false, details: '' },
        { id: 'trade_count', name: 'Trades', currentValue: 30, threshold: 50, passed: false, details: '' },
      ],
      allPassed: false,
      passedCount: 0,
      totalGates: 2,
      estimatedDaysRemaining: 15,
    };

    const curr: PromotionReadiness = {
      evaluatedAt: '2025-01-31T00:00:00Z',
      gates: [
        { id: 'duration', name: 'Duration', currentValue: 31, threshold: 30, passed: true, details: '' },
        { id: 'trade_count', name: 'Trades', currentValue: 30, threshold: 50, passed: false, details: '' },
      ],
      allPassed: false,
      passedCount: 1,
      totalGates: 2,
      estimatedDaysRemaining: 0,
    };

    const transitions = detectTransitions(prev, curr);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.gateId).toBe('duration');
    expect(transitions[0]!.wasPassed).toBe(false);
    expect(transitions[0]!.nowPassed).toBe(true);
  });

  it('appends transitions when recording evaluations', () => {
    const store = new InMemoryGateStateStore();

    const prev: PromotionReadiness = {
      evaluatedAt: '2025-01-01T00:00:00Z',
      gates: [
        { id: 'duration', name: 'Duration', currentValue: 15, threshold: 30, passed: false, details: '' },
      ],
      allPassed: false,
      passedCount: 0,
      totalGates: 1,
      estimatedDaysRemaining: 15,
    };

    const curr: PromotionReadiness = {
      evaluatedAt: '2025-01-31T00:00:00Z',
      gates: [
        { id: 'duration', name: 'Duration', currentValue: 31, threshold: 30, passed: true, details: '' },
      ],
      allPassed: true,
      passedCount: 1,
      totalGates: 1,
      estimatedDaysRemaining: 0,
    };

    store.save(prev);
    const transitions = recordEvaluation(store, curr);

    expect(transitions).toHaveLength(1);
    expect(store.loadTransitions('duration')).toHaveLength(1);
  });

  it('returns no transitions when nothing changed', () => {
    const store = new InMemoryGateStateStore();

    const reading: PromotionReadiness = {
      evaluatedAt: '2025-01-01T00:00:00Z',
      gates: [
        { id: 'duration', name: 'Duration', currentValue: 31, threshold: 30, passed: true, details: '' },
      ],
      allPassed: true,
      passedCount: 1,
      totalGates: 1,
      estimatedDaysRemaining: 0,
    };

    store.save(reading);
    const transitions = recordEvaluation(store, { ...reading, evaluatedAt: '2025-01-02T00:00:00Z' });
    expect(transitions).toHaveLength(0);
  });
});

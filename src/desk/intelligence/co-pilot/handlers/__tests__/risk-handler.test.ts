/**
 * Tests for risk-handler.handleRiskQuery.
 *
 * All four dependency singletons are injected so no Redis/DB is touched.
 * Covers: no metrics, halted drawdown, circuit breaker open, consecutive
 * losses, positions present/empty, and the strategyId exposure branch.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleRiskQuery } from '../risk-handler';
import type { CopilotResponse } from '../response-formatter';
import type { KellyPositionSizer } from '../../../risk/kelly-position-sizer';
import type { DrawdownMonitor } from '../../../risk/drawdown-monitor';
import type { CircuitBreaker } from '../../../risk/circuit-breaker';
import type { PositionManager } from '../../../risk/position-manager';
import type { DrawdownMetrics } from '../../../risk/drawdown-monitor-types';
import type { CircuitStatus } from '../../../risk/circuit-breaker';
import type { Position } from '../../../risk/position-manager-types';

function makeMetrics(overrides: Partial<DrawdownMetrics> = {}): DrawdownMetrics {
  return {
    currentDrawdown: 0.05,
    maxDrawdown: 0.1,
    peakValue: 1000,
    currentValue: 950,
    dailyPnl: 0,
    dailyDrawdown: 0.05,
    consecutiveLosses: 0,
    isHalted: false,
    ...overrides,
  };
}

function makeCircuit(overrides: Partial<CircuitStatus> = {}): CircuitStatus {
  return { state: 'CLOSED', reason: '', ...overrides } as CircuitStatus;
}

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    symbol: 'BTC',
    exchange: 'binance',
    side: 'long',
    amount: 1,
    entryPrice: 50000,
    currentValue: 50000,
    unrealizedPnl: 0,
    openedAt: Date.now(),
    ...overrides,
  };
}

function makeDeps(overrides: Partial<{
  metrics: DrawdownMetrics | null;
  circuit: CircuitStatus;
  positions: Position[];
  exposure: unknown;
}> = {}) {
  const metricsVal = overrides.metrics !== undefined ? overrides.metrics : makeMetrics();
  return {
    kellySizer: {} as KellyPositionSizer,
    drawdownMonitor: {
      getMetrics: vi.fn().mockResolvedValue(metricsVal),
    } as unknown as DrawdownMonitor,
    circuitBreaker: {
      getStatus: vi.fn().mockResolvedValue(overrides.circuit ?? makeCircuit()),
    } as unknown as CircuitBreaker,
    positionManager: {
      getAllPositions: vi.fn().mockResolvedValue(overrides.positions ?? []),
      getExposureSummary: vi.fn().mockResolvedValue({}),
    } as unknown as PositionManager,
  };
}

describe('handleRiskQuery', () => {
  it('returns a CopilotResponse with answer and actions', async () => {
    const deps = makeDeps({ metrics: makeMetrics(), positions: [] });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.answer).toContain('**Risk Assessment**');
    expect(res.actions).toHaveLength(2);
    expect(res.sourceData).toEqual({
      riskScore: expect.any(Number),
      drawdown: expect.any(Number),
      circuitState: 'CLOSED',
      warnings: [],
    });
  });

  it('uses zeroed metrics when the monitor returns null', async () => {
    const deps = makeDeps({ metrics: null, positions: [] });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.sourceData).toEqual({
      riskScore: 0,
      drawdown: 0,
      circuitState: 'CLOSED',
      warnings: [],
    });
    expect(res.answer).toContain('Drawdown: 0.00%');
  });

  it('computes risk score from drawdown percentage', async () => {
    // 0.30 * 100 = 30; min(10, round((30/15)*10)) = min(10, 20) = 10
    const deps = makeDeps({ metrics: makeMetrics({ currentDrawdown: 0.3, maxDrawdown: 0.4 }), positions: [] });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.sourceData.riskScore).toBe(10);
    expect(res.answer).toContain('Risk score: 10/10 (high)');
  });

  it('labels low/moderate risk correctly', async () => {
    const low = await handleRiskQuery(undefined, makeDeps({ metrics: makeMetrics({ currentDrawdown: 0.01 }) }));
    expect(low.answer).toContain('Risk score: 1/10 (low)');
    // 0.08*100=8; round((8/15)*10)=round(5.33)=5 -> moderate
    const moderate = await handleRiskQuery(undefined, makeDeps({ metrics: makeMetrics({ currentDrawdown: 0.08 }) }));
    expect(moderate.answer).toContain('Risk score: 5/10 (moderate)');
  });

  it('includes max drawdown line when metrics exist', async () => {
    const deps = makeDeps({ metrics: makeMetrics({ currentDrawdown: 0.05, maxDrawdown: 0.1 }) });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.answer).toContain('Drawdown: 5.00% (max: 10.00%)');
  });

  it('omits max drawdown when metrics are null', async () => {
    const deps = makeDeps({ metrics: null });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.answer).not.toContain('max:');
  });

  it('warns when trading is halted', async () => {
    const deps = makeDeps({ metrics: makeMetrics({ isHalted: true, currentDrawdown: 0.15 }), positions: [] });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.sourceData.warnings).toContain('Trading is halted due to drawdown breach');
    expect(res.answer).toContain('**Warnings:**');
  });

  it('warns when the circuit breaker is not CLOSED', async () => {
    const deps = makeDeps({ circuit: makeCircuit({ state: 'OPEN', reason: 'too many losses' }), positions: [] });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.sourceData.warnings).toContain('Circuit breaker is OPEN: too many losses');
    expect(res.answer).toContain('Circuit breaker: OPEN');
  });

  it('warns on three or more consecutive losses', async () => {
    const deps = makeDeps({ metrics: makeMetrics({ consecutiveLosses: 5 }), positions: [] });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.sourceData.warnings).toContain('5 consecutive losses detected');
  });

  it('does not warn on one or two consecutive losses', async () => {
    const deps = makeDeps({ metrics: makeMetrics({ consecutiveLosses: 2 }) });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.sourceData.warnings).toHaveLength(0);
  });

  it('reports "none" when there are no positions', async () => {
    const deps = makeDeps({ positions: [] });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.answer).toContain('Largest position: none');
    expect(res.answer).toContain('Positions: 0 open');
  });

  it('reports the largest position by current value', async () => {
    const deps = makeDeps({
      metrics: makeMetrics({ currentValue: 200 }),
      positions: [
        makePosition({ symbol: 'ETH', exchange: 'binance', currentValue: 50 }),
        makePosition({ symbol: 'BTC', exchange: 'binance', currentValue: 100 }),
      ],
    });
    const res = await handleRiskQuery(undefined, deps);
    expect(res.answer).toContain('Largest position: BTC/binance at 50.0%');
    expect(res.answer).toContain('Positions: 2 open');
  });

  it('requests exposure summary only when a strategyId is given', async () => {
    const deps = makeDeps({ positions: [] });
    await handleRiskQuery({ strategyId: 'strat-1' }, deps);
    expect((deps.positionManager as unknown as { getExposureSummary: ReturnType<typeof vi.fn> }).getExposureSummary).toHaveBeenCalledWith();
    const deps2 = makeDeps({ positions: [] });
    await handleRiskQuery(undefined, deps2);
    expect((deps2.positionManager as unknown as { getExposureSummary: ReturnType<typeof vi.fn> }).getExposureSummary).not.toHaveBeenCalled();
  });
});

/**
 * Tests for report-handler — handleReportQuery aggregates data from all
 * sub-handlers and risk infrastructure.
 *
 * All four sub-handlers and the risk classes are mocked; logger is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogger,
  mockHandleRiskQuery,
  mockHandleArbQuery,
  mockHandlePerformanceQuery,
  mockHandleRegimeQuery,
  mockGetAccuracyReport,
  mockDrawdown,
  mockCircuit,
  mockPositions,
} = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockHandleRiskQuery: vi.fn(),
  mockHandleArbQuery: vi.fn(),
  mockHandlePerformanceQuery: vi.fn(),
  mockHandleRegimeQuery: vi.fn(),
  mockGetAccuracyReport: vi.fn(),
  mockDrawdown: { getMetrics: vi.fn() },
  mockCircuit: { getStatus: vi.fn() },
  mockPositions: { getAllPositions: vi.fn() },
}));

vi.mock('../../../../../../src/desk/shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../../../src/desk/intelligence/co-pilot/handlers/risk-handler', () => ({ handleRiskQuery: mockHandleRiskQuery }));
vi.mock('../../../../../../src/desk/intelligence/co-pilot/handlers/arb-handler', () => ({ handleArbQuery: mockHandleArbQuery }));
vi.mock('../../../../../../src/desk/intelligence/co-pilot/handlers/performance-handler', () => ({ handlePerformanceQuery: mockHandlePerformanceQuery }));
vi.mock('../../../../../../src/desk/intelligence/co-pilot/handlers/regime-handler', () => ({ handleRegimeQuery: mockHandleRegimeQuery }));
vi.mock('../../../../../../src/desk/intelligence/prediction-accuracy-tracker', () => ({
  getAccuracyReport: mockGetAccuracyReport,
}));
vi.mock('../../../../../../src/desk/risk/drawdown-monitor', () => ({
  DrawdownMonitor: function DrawdownMonitor() { return mockDrawdown; },
}));
vi.mock('../../../../../../src/desk/risk/circuit-breaker', () => ({
  CircuitBreaker: function CircuitBreaker() { return mockCircuit; },
}));
vi.mock('../../../../../../src/desk/risk/position-manager', () => ({
  PositionManager: function PositionManager() { return mockPositions; },
}));

import { handleReportQuery } from '../../../../../../src/desk/intelligence/co-pilot/handlers/report-handler';

function riskSource(overrides: Record<string, unknown> = {}) {
  return {
    riskScore: 3, drawdown: 0.05, circuitState: 'CLOSED', warnings: [],
    ...overrides,
  };
}
function arbSource(overrides: Record<string, unknown> = {}) {
  return { spreadsFound: 7, crossMarketBasket: true, ...overrides };
}
function perfSource(overrides: Record<string, unknown> = {}) {
  return { winRate: 0.6, totalPredictions: 100, resolvedCount: 60, ...overrides };
}
function regimeSource(overrides: Record<string, unknown> = {}) {
  return { regime: 'trend', signalDirection: 'UP', signalConfidence: 0.8, tfAnalysis: [], ...overrides };
}

function setupResults() {
  mockHandleRiskQuery.mockResolvedValue({
    answer: 'risk', actions: [], sourceData: riskSource(),
  });
  mockHandleArbQuery.mockResolvedValue({
    answer: 'arb', actions: [], sourceData: arbSource(),
  });
  mockHandlePerformanceQuery.mockResolvedValue({
    answer: 'perf', actions: [], sourceData: perfSource(),
  });
  mockHandleRegimeQuery.mockResolvedValue({
    answer: 'regime', actions: [], sourceData: regimeSource(),
  });
  mockGetAccuracyReport.mockReturnValue({
    winRate: 0.6, correct: 60, resolved: 100, pending: 20, totalPredictions: 100,
    avgConfidenceWhenCorrect: 0.8, avgConfidenceWhenIncorrect: 0.5,
    byStrategy: {}, byConfidenceBucket: {},
  });
  mockDrawdown.getMetrics.mockResolvedValue({ currentDrawdown: 0.05, isHalted: false });
  mockCircuit.getStatus.mockResolvedValue({ state: 'CLOSED', reason: '' });
  mockPositions.getAllPositions.mockResolvedValue([
    { unrealizedPnl: 100 }, { unrealizedPnl: -50 },
  ]);
}

describe('handleReportQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupResults();
  });

  it('returns a CopilotResponse with answer and actions', async () => {
    const res = await handleReportQuery();
    expect(res.answer).toContain('**Weekly Report**');
    expect(res.actions).toHaveLength(3);
    expect(res.sourceData).toEqual(
      expect.objectContaining({
        regime: 'trend',
        riskScore: 3,
        winRate: 0.6,
        openPositions: 2,
        spreadsFound: 7,
      }),
    );
  });

  it('calls every sub-handler with the context', async () => {
    await handleReportQuery({ strategyId: 'strat-1' });
    expect(mockHandleRiskQuery).toHaveBeenCalledWith({ strategyId: 'strat-1' });
    expect(mockHandleArbQuery).toHaveBeenCalledWith({ strategyId: 'strat-1' });
    expect(mockHandlePerformanceQuery).toHaveBeenCalledWith({ strategyId: 'strat-1' });
    expect(mockHandleRegimeQuery).toHaveBeenCalledWith({ strategyId: 'strat-1' });
  });

  it('renders the market overview from the regime result', async () => {
    const res = await handleReportQuery();
    expect(res.answer).toContain('Regime: trend');
    expect(res.answer).toContain('Signal direction: UP');
  });

  it('uses N/A for regime fields when a sub-handler failed', async () => {
    mockHandleRegimeQuery.mockResolvedValue(null);
    const res = await handleReportQuery();
    expect(res.answer).toContain('Regime: N/A');
    expect(res.answer).toContain('Signal direction: N/A');
    expect(res.sourceData.regime).toBeUndefined();
  });

  it('renders the risk summary', async () => {
    const res = await handleReportQuery();
    expect(res.answer).toContain('Risk score: 3/10');
    expect(res.answer).toContain('Drawdown: 0.05%');
    expect(res.answer).toContain('Circuit breaker: CLOSED');
  });

  it('renders the strategy performance from accuracy report', async () => {
    const res = await handleReportQuery();
    expect(res.answer).toContain('Win rate: 60.0% (60/100)');
    expect(res.answer).toContain('Pending predictions: 20');
  });

  it('renders the arbitrage scan section', async () => {
    const res = await handleReportQuery();
    expect(res.answer).toContain('Spreads found: 7');
    expect(res.answer).toContain('Cross-market: Yes');
  });

  it('renders cross-market as No when the basket is absent', async () => {
    mockHandleArbQuery.mockResolvedValue({
      answer: 'arb', actions: [], sourceData: arbSource({ crossMarketBasket: false }),
    });
    const res = await handleReportQuery();
    expect(res.answer).toContain('Cross-market: No');
  });

  it('renders the portfolio section with summed unrealized P&L', async () => {
    const res = await handleReportQuery();
    expect(res.answer).toContain('Open positions: 2');
    expect(res.answer).toContain('Unrealized P&L: $50.00'); // 100 + (-50)
  });

  it('renders zero P&L when there are no positions', async () => {
    mockPositions.getAllPositions.mockResolvedValue([]);
    const res = await handleReportQuery();
    expect(res.answer).toContain('Open positions: 0');
    expect(res.answer).toContain('Unrealized P&L: $0.00');
    expect(res.sourceData.openPositions).toBe(0);
  });

  it('includes a generated date line', async () => {
    const res = await handleReportQuery();
    expect(res.answer).toMatch(/Generated: \w+, \w+ \d+, \d{4}/);
  });

  it('swallows failures from the drawdown monitor and continues', async () => {
    mockDrawdown.getMetrics.mockRejectedValue(new Error('down'));
    const res = await handleReportQuery();
    expect(res.answer).toContain('**2. Risk Summary**');
  });

  it('swallows failures from the circuit breaker and continues', async () => {
    mockCircuit.getStatus.mockRejectedValue(new Error('cb'));
    const res = await handleReportQuery();
    expect(res.answer).toContain('Circuit breaker: N/A');
  });

  it('swallows failures from position manager and continues', async () => {
    mockPositions.getAllPositions.mockRejectedValue(new Error('pm'));
    const res = await handleReportQuery();
    expect(res.answer).toContain('Open positions: 0');
    expect(res.answer).toContain('Unrealized P&L: $0.00');
  });

  it('reports N/A drawdown when the risk result has no drawdown', async () => {
    mockHandleRiskQuery.mockResolvedValue({
      answer: 'risk', actions: [], sourceData: riskSource({ drawdown: undefined }),
    });
    const res = await handleReportQuery();
    expect(res.answer).toContain('Drawdown: N/A');
  });

  it('always uses the injected accuracy report for win rate', async () => {
    mockGetAccuracyReport.mockReturnValue({
      winRate: 0.25, correct: 25, resolved: 100, pending: 75, totalPredictions: 100,
      avgConfidenceWhenCorrect: 0, avgConfidenceWhenIncorrect: 0,
      byStrategy: {}, byConfidenceBucket: {},
    });
    const res = await handleReportQuery();
    expect(res.answer).toContain('Win rate: 25.0% (25/100)');
    expect(res.sourceData.winRate).toBe(0.25);
  });

  // ── Sub-handler rejection — .catch(() => null) handlers (lines 25-28) ────

  it('survives handleRiskQuery rejecting (catch → null, line 25)', async () => {
    mockHandleRiskQuery.mockRejectedValue(new Error('risk boom'));
    const res = await handleReportQuery();
    // riskResult is null → riskScore and drawdown fall back to N/A
    expect(res.answer).toContain('Risk score: N/A/10');
    expect(res.answer).toContain('Drawdown: N/A');
    expect(res.sourceData.riskScore).toBeUndefined();
  });

  it('survives handleArbQuery rejecting (catch → null, line 26)', async () => {
    mockHandleArbQuery.mockRejectedValue(new Error('arb boom'));
    const res = await handleReportQuery();
    // arbResult is null → spreadsFound defaults to 0, crossMarketBasket falsy → No
    expect(res.answer).toContain('Spreads found: 0');
    expect(res.answer).toContain('Cross-market: No');
    expect(res.sourceData.spreadsFound).toBeUndefined();
  });

  it('survives handlePerformanceQuery rejecting (catch → null, line 27)', async () => {
    mockHandlePerformanceQuery.mockRejectedValue(new Error('perf boom'));
    const res = await handleReportQuery();
    // perfResult is null — no direct render, but the aggregation must still succeed
    expect(res.answer).toContain('**3. Strategy Performance**');
    expect(res.answer).toContain('Win rate');
  });

  it('survives handleRegimeQuery rejecting (catch → null, line 28)', async () => {
    mockHandleRegimeQuery.mockRejectedValue(new Error('regime boom'));
    const res = await handleReportQuery();
    // regimeResult is null → regime and signalDirection fall back to N/A
    expect(res.answer).toContain('Regime: N/A');
    expect(res.answer).toContain('Signal direction: N/A');
    expect(res.sourceData.regime).toBeUndefined();
  });
});

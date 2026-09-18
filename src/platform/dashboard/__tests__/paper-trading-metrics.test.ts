import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PnlSnapshot } from '../paper-trading-pnl-tracker';

const mockGaugeSet = vi.hoisted(() => vi.fn());
const mockGaugeCtor = vi.hoisted(() => vi.fn(function GaugeMock() { return { set: mockGaugeSet }; }));
const mockCounterCtor = vi.hoisted(() => vi.fn(function CounterMock() { return { inc: vi.fn() }; }));
const mockHistogramCtor = vi.hoisted(() => vi.fn(function HistogramMock() { return { observe: vi.fn() }; }));
const mockRegistryCtor = vi.hoisted(() => vi.fn(function RegistryMock() { return { contentType: 'text/plain', metrics: vi.fn().mockResolvedValue('') }; }));

vi.mock('prom-client', () => ({
  default: {
    Gauge: mockGaugeCtor, Counter: mockCounterCtor, Histogram: mockHistogramCtor, Registry: mockRegistryCtor, collectDefaultMetrics: vi.fn(),
  },
}));
vi.mock('../../middleware/prometheus-metrics', () => ({ register: {} }));

describe('Paper Trading: Metrics', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGaugeSet.mockClear();
    mockGaugeCtor.mockClear();
    mockRegistryCtor.mockClear();
  });

  describe('registerPaperTradingMetrics', () => {
    it('should create 5 gauges on first call', async () => {
      const mod = await import('../paper-trading-pnl-tracker');
      const before = mockGaugeCtor.mock.calls.length;
      mod.registerPaperTradingMetrics();
      expect(mockGaugeCtor.mock.calls.length - before).toBe(5);
    });

    it('should be idempotent — second call does not create new gauges', async () => {
      const mod = await import('../paper-trading-pnl-tracker');
      mod.registerPaperTradingMetrics();
      const afterFirst = mockGaugeCtor.mock.calls.length;
      mod.registerPaperTradingMetrics();
      mod.registerPaperTradingMetrics();
      expect(mockGaugeCtor.mock.calls.length - afterFirst).toBe(0);
    });
  });

  describe('updatePaperTradingMetrics', () => {
    it('should auto-register gauges if not yet registered', async () => {
      const mod = await import('../paper-trading-pnl-tracker');
      const snapshot: PnlSnapshot = {
        timestamp: 1_700_000_000_000, totalPnl: 100, unrealizedPnl: 0, realizedPnl: 100,
        openPositions: 2, closedTrades: 5, winRate: 0.6, avgEdge: 0.05, maxDrawdown: 0.15, sharpeRatio: 1.2, capitalRemaining: 900,
      };
      const before = mockGaugeCtor.mock.calls.length;
      mod.updatePaperTradingMetrics(snapshot);
      expect(mockGaugeCtor.mock.calls.length - before).toBe(5);
      expect(mockGaugeSet).toHaveBeenCalledTimes(5);
    });

    it('should set gauge values from snapshot fields', async () => {
      const mod = await import('../paper-trading-pnl-tracker');
      mod.registerPaperTradingMetrics();
      mockGaugeSet.mockClear();
      mockGaugeCtor.mockClear();

      const snapshot: PnlSnapshot = {
        timestamp: 1_700_000_000_000, totalPnl: 250.5, unrealizedPnl: 0, realizedPnl: 250.5,
        openPositions: 3, closedTrades: 12, winRate: 0.75, avgEdge: 0.08, maxDrawdown: 0.12, sharpeRatio: 2.1, capitalRemaining: 750,
      };
      mod.updatePaperTradingMetrics(snapshot);
      expect(mockGaugeSet).toHaveBeenCalledTimes(5);
      const values = mockGaugeSet.mock.calls.map((c: unknown[]) => c[0]);
      expect(values).toContain(250.5);
      expect(values).toContain(0.75);
      expect(values).toContain(3);
      expect(values).toContain(0.12);
      expect(values).toContain(2.1);
    });

    it('should not re-create gauges when already registered', async () => {
      const mod = await import('../paper-trading-pnl-tracker');
      mod.registerPaperTradingMetrics();
      mockGaugeCtor.mockClear();
      mockGaugeSet.mockClear();

      const snapshot: PnlSnapshot = {
        timestamp: 1_700_000_000_000, totalPnl: 0, unrealizedPnl: 0, realizedPnl: 0,
        openPositions: 0, closedTrades: 0, winRate: 0, avgEdge: 0, maxDrawdown: 0, sharpeRatio: 0, capitalRemaining: 1000,
      };
      mod.updatePaperTradingMetrics(snapshot);
      mod.updatePaperTradingMetrics(snapshot);
      expect(mockGaugeCtor).toHaveBeenCalledTimes(0);
      expect(mockGaugeSet).toHaveBeenCalledTimes(10);
    });
  });
});

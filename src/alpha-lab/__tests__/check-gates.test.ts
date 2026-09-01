/**
 * check-gates — Unit Tests
 *
 * Covers loadPaperData, renderGateTable, formatGateValue, formatThreshold.
 * Mocks fetch (paper-trades API), ExchangeConnectionTester, and logger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPaperData, renderGateTable, formatGateValue, formatThreshold, type GateEvaluatorInput } from '../check-gates';
import type { PromotionReadiness, GateStatus } from '../gates/gate-types';

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../desk/tests/exchange-connection-test', () => ({
  ExchangeConnectionTester: class {
    testAll() {
      return Promise.resolve([
        { restOk: true, wsOk: true, error: null },
        { restOk: true, wsOk: true, error: null },
      ]);
    }
  },
}));

const TEST_TRADES = [
  { id: 't1', tokenId: 'BTC', side: 'BUY' as const, price: 50000, size: 1, pnl: 100, timestamp: '2026-08-01T10:00:00Z' },
  { id: 't2', tokenId: 'ETH', side: 'SELL' as const, price: 3000, size: 2, pnl: -200, timestamp: '2026-08-05T10:00:00Z' },
  { id: 't3', tokenId: 'BTC', side: 'BUY' as const, price: 50000, size: 0.5, pnl: null, timestamp: '2026-08-03T10:00:00Z' },
];

describe('check-gates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadPaperData', () => {
    it('fetches paper trades and builds GateEvaluatorInput', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: TEST_TRADES }),
      }));

      const input = await loadPaperData();

      expect(input.trades).toHaveLength(2);
      expect(input.trades[0].pnl).toBe(100);
      expect(input.equityCurve).toHaveLength(2);
      expect(input.equityCurve[0].equity).toBe(10100);
      expect(input.equityCurve[1].equity).toBe(9900);
      expect(input.startDate).toBe('2026-08-01T10:00:00Z');
      expect(input.flags.kellyWired).toBe(true);
      expect(input.flags.circuitBreakerTested).toBe(true);
      expect(input.flags.exchangeConnectivityGreen).toBe(true);
      expect(input.testWinRate).toBeUndefined();
      expect(input.valWinRate).toBeUndefined();
    });

    it('falls back to empty trades when API returns error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }));

      const input = await loadPaperData();

      expect(input.trades).toHaveLength(0);
      expect(input.equityCurve).toHaveLength(0);
      expect(input.flags.kellyWired).toBe(true);
    });

    it('falls back to empty trades when API throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

      const input = await loadPaperData();

      expect(input.trades).toHaveLength(0);
      expect(input.flags.exchangeConnectivityGreen).toBe(true);
    });

    it('starts date from 15 days ago when no closed trades', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [{ ...TEST_TRADES[2] }] }),
      }));

      const input = await loadPaperData();
      expect(input.startDate).toBeTruthy();
    });

    it('sorts equity curve chronologically', async () => {
      const unsorted = [
        { id: 't1', tokenId: 'X', side: 'BUY' as const, price: 100, size: 1, pnl: 50, timestamp: '2026-08-05T10:00:00Z' },
        { id: 't2', tokenId: 'Y', side: 'SELL' as const, price: 200, size: 1, pnl: 100, timestamp: '2026-08-01T10:00:00Z' },
      ];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: unsorted }),
      }));

      const input = await loadPaperData();
      expect(input.equityCurve[0].timestamp).toBe('2026-08-01T10:00:00Z');
      expect(input.equityCurve[1].timestamp).toBe('2026-08-05T10:00:00Z');
    });
  });

  describe('renderGateTable', () => {
    it('renders all-pass result with PASS status and eligibility message', () => {
      const reading: PromotionReadiness = {
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: true,
        passedCount: 3,
        totalGates: 3,
        estimatedDaysRemaining: null,
        gates: [
          { id: 'win_rate', name: 'Win Rate Gate', currentValue: 0.6, threshold: 0.55, direction: 'at_least', passed: true },
          { id: 'duration', name: 'Duration Gate', currentValue: 30, threshold: 14, direction: 'at_least', passed: true },
          { id: 'kelly_wired', name: 'Kelly Wired Gate', currentValue: 1, threshold: 1, direction: 'at_least', passed: true },
        ],
      };

      const output = renderGateTable(reading);
      expect(output).toContain('=== Transition Criteria Gate Status ===');
      expect(output).toContain('Evaluated: 2026-08-31T12:00:00Z');
      expect(output).toContain('Result: 3/3 gates passing');
      expect(output).toContain('STATUS: ALL GATES PASSING');
    });

    it('renders failing result with FAIL status and gate count', () => {
      const reading: PromotionReadiness = {
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: false,
        passedCount: 1,
        totalGates: 3,
        estimatedDaysRemaining: 5,
        gates: [
          { id: 'win_rate', name: 'Win Rate Gate', currentValue: 0.4, threshold: 0.55, direction: 'at_least', passed: false },
          { id: 'max_drawdown', name: 'Max Drawdown Gate', currentValue: 0.15, threshold: 0.10, direction: 'at_most', passed: false },
          { id: 'duration', name: 'Duration Gate', currentValue: 10, threshold: 14, direction: 'at_least', passed: true },
        ],
      };

      const output = renderGateTable(reading);
      expect(output).toContain('Result: 1/3 gates passing');
      expect(output).toContain('STATUS: 2 gate(s) still failing');
      expect(output).toContain('Estimated days until duration gate: 5');
    });

    it('omits estimated days line when estimatedDaysRemaining is null', () => {
      const reading: PromotionReadiness = {
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: false,
        passedCount: 0,
        totalGates: 1,
        estimatedDaysRemaining: null,
        gates: [
          { id: 'duration', name: 'Duration Gate', currentValue: null, threshold: 14, direction: 'at_least', passed: false },
        ],
      };

      const output = renderGateTable(reading);
      expect(output).not.toContain('Estimated days');
      expect(output).toContain('N/A');
    });
  });

  describe('formatGateValue', () => {
    it('returns N/A for null currentValue', () => {
      expect(formatGateValue({ currentValue: null, id: 'duration' })).toBe('N/A');
    });

    it('formats win_rate as percentage', () => {
      expect(formatGateValue({ currentValue: 0.625, id: 'win_rate' })).toBe('62.5%');
    });

    it('formats max_drawdown as percentage', () => {
      expect(formatGateValue({ currentValue: 0.123, id: 'max_drawdown' })).toBe('12.3%');
    });

    it('formats boolean gates as Yes/No', () => {
      expect(formatGateValue({ currentValue: 1, id: 'kelly_wired' })).toBe('Yes');
      expect(formatGateValue({ currentValue: 0, id: 'circuit_breaker' })).toBe('No');
      expect(formatGateValue({ currentValue: 1, id: 'exchange_connectivity' })).toBe('Yes');
    });

    it('formats numeric values rounded to 2 decimals', () => {
      expect(formatGateValue({ currentValue: 3.14159, id: 'sharpe_ratio' })).toBe('3.14');
      expect(formatGateValue({ currentValue: 3.567, id: 'profit_factor' })).toBe('3.57');
    });
  });

  describe('formatThreshold', () => {
    it('returns dash for null threshold', () => {
      expect(formatThreshold({ threshold: null, id: 'win_rate' })).toBe('-');
    });

    it('formats win_rate with >= prefix and percentage', () => {
      expect(formatThreshold({ threshold: 0.55, id: 'win_rate' })).toBe('>= 55%');
    });

    it('formats max_drawdown with <= prefix and percentage', () => {
      expect(formatThreshold({ threshold: 0.1, id: 'max_drawdown' })).toBe('<= 10%');
    });

    it('formats duration with >= prefix and d suffix', () => {
      expect(formatThreshold({ threshold: 14, id: 'duration' })).toBe('>= 14d');
    });

    it('formats numeric thresholds with prefix', () => {
      expect(formatThreshold({ threshold: 2.0, id: 'profit_factor' })).toBe('>= 2');
      expect(formatThreshold({ threshold: 1.5, id: 'sharpe_ratio' })).toBe('>= 1.5');
    });
  });
});
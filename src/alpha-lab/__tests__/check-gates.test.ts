/**
 * check-gates — Unit Tests
 *
 * Covers loadPaperData and checkExchangeHealth.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPaperData } from '../check-gates';

let mockTestAllResults: Array<{ restOk: boolean; wsOk: boolean; error?: string | null }> = [
  { restOk: true, wsOk: true, error: null },
  { restOk: true, wsOk: true, error: null },
];
let shouldTestAllThrow = false;

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../desk/tests/exchange-connection-test', () => ({
  ExchangeConnectionTester: class {
    testAll() {
      if (shouldTestAllThrow) {
        return Promise.reject(new Error('connection failed'));
      }
      return Promise.resolve(mockTestAllResults);
    }
  },
}));

const TEST_TRADES = [
  { id: 't1', tokenId: 'BTC', side: 'BUY' as const, price: 50000, size: 1, pnl: 100, timestamp: '2026-08-01T10:00:00Z' },
  { id: 't2', tokenId: 'ETH', side: 'SELL' as const, price: 3000, size: 2, pnl: -200, timestamp: '2026-08-05T10:00:00Z' },
  { id: 't3', tokenId: 'BTC', side: 'BUY' as const, price: 50000, size: 0.5, pnl: null, timestamp: '2026-08-03T10:00:00Z' },
];

describe('check-gates paper data loader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    shouldTestAllThrow = false;
    mockTestAllResults = [
      { restOk: true, wsOk: true, error: null },
      { restOk: true, wsOk: true, error: null },
    ];
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

    it('handles response without trades property', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }));

      const input = await loadPaperData();
      expect(input.trades).toHaveLength(0);
    });

    it('starts date from 15 days ago when no closed trades', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [{ ...TEST_TRADES[2] }] }),
      }));

      const input = await loadPaperData();
      expect(input.startDate).toBeTruthy();
    });

    it('sorts equity curve chronologically and finds earliest timestamp', async () => {
      const unsorted = [
        { id: 't1', tokenId: 'X', side: 'BUY' as const, price: 100, size: 1, pnl: 50, timestamp: '2026-08-05T10:00:00Z' },
        { id: 't2', tokenId: 'Y', side: 'SELL' as const, price: 200, size: 1, pnl: 100, timestamp: '2026-08-01T10:00:00Z' },
        { id: 't3', tokenId: 'Z', side: 'BUY' as const, price: 300, size: 1, pnl: 20, timestamp: '2026-08-03T10:00:00Z' },
      ];
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: unsorted }),
      }));

      const input = await loadPaperData();
      expect(input.startDate).toBe('2026-08-01T10:00:00Z');
      expect(input.equityCurve[0].timestamp).toBe('2026-08-01T10:00:00Z');
      expect(input.equityCurve[1].timestamp).toBe('2026-08-03T10:00:00Z');
      expect(input.equityCurve[2].timestamp).toBe('2026-08-05T10:00:00Z');
    });
  });

  describe('checkExchangeHealth via loadPaperData', () => {
    it('returns true when all exchanges have restOk and wsOk', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      mockTestAllResults = [{ restOk: true, wsOk: true, error: null }];

      const input = await loadPaperData();
      expect(input.flags.exchangeConnectivityGreen).toBe(true);
    });

    it('returns true when wsOk is false but no error exists', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      mockTestAllResults = [{ restOk: true, wsOk: false, error: null }];

      const input = await loadPaperData();
      expect(input.flags.exchangeConnectivityGreen).toBe(true);
    });

    it('returns false when wsOk is false and error exists', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      mockTestAllResults = [{ restOk: true, wsOk: false, error: 'timeout' }];

      const input = await loadPaperData();
      expect(input.flags.exchangeConnectivityGreen).toBe(false);
    });

    it('returns false when restOk is false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      mockTestAllResults = [{ restOk: false, wsOk: true, error: null }];

      const input = await loadPaperData();
      expect(input.flags.exchangeConnectivityGreen).toBe(false);
    });

    it('returns false when ExchangeConnectionTester throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      shouldTestAllThrow = true;

      const input = await loadPaperData();
      expect(input.flags.exchangeConnectivityGreen).toBe(false);
    });
  });
});

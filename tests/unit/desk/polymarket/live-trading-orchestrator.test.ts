import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LiveTradingOrchestrator } from '../../../../src/desk/polymarket/live-trading-orchestrator';
import {
  normalizeConfig,
  buildCoreComponents,
  buildStartComponents,
} from '../../../../src/desk/polymarket/live-trading-adapter-setup';
import {
  persistOrchestratorState,
  restoreOrchestratorState,
} from '../../../../src/desk/polymarket/live-trading-state-persistence';
import * as adapterModule from '../../../../src/desk/execution/polymarket-execution-adapter';
import { tradingEventBus } from '../../../../src/desk/events/trading-event-bus';
import type { PolymarketOrder } from '../../../../src/desk/execution/polymarket-signer';

describe('LiveTradingOrchestrator & Setup & Persistence', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('normalizeConfig', () => {
    it('applies defaults when options are omitted', () => {
      delete process.env.PAPER_MODE;
      const res = normalizeConfig({ capitalUsdc: 5000 });
      expect(res.capitalUsdc).toBe(5000);
      expect(res.paperTrading).toBe(true);
      expect(res.maxPositionFraction).toBe(0.02);
      expect(res.maxDailyDrawdown).toBe(0.05);
      expect(res.maxConcurrentPositions).toBe(10);
      expect(res.maxConsecutiveLosses).toBe(3);
    });

    it('respects explicit values and PAPER_MODE env false', () => {
      process.env.PAPER_MODE = 'false';
      const res = normalizeConfig({
        capitalUsdc: 10000,
        maxPositionFraction: 0.05,
        maxDailyDrawdown: 0.1,
        maxConcurrentPositions: 5,
        maxConsecutiveLosses: 2,
      });
      expect(res.paperTrading).toBe(false);
      expect(res.maxPositionFraction).toBe(0.05);
      expect(res.maxDailyDrawdown).toBe(0.1);
      expect(res.maxConcurrentPositions).toBe(5);
      expect(res.maxConsecutiveLosses).toBe(2);
    });

    it('respects explicit paperTrading override over env', () => {
      process.env.PAPER_MODE = 'false';
      const res = normalizeConfig({ capitalUsdc: 1000, paperTrading: true });
      expect(res.paperTrading).toBe(true);
    });
  });

  describe('buildStartComponents', () => {
    it('attaches adapter and orderManager when adapter is built in live mode', () => {
      const mockAdapter = {
        getOrderBook: vi.fn(),
        placeOrder: vi.fn(),
      };
      vi.spyOn(adapterModule, 'buildPolymarketAdapter').mockReturnValue({
        adapter: mockAdapter as never,
        signer: null as never,
        mode: 'LIVE',
      });

      const core = buildCoreComponents({ capitalUsdc: 1000, paperTrading: false });
      buildStartComponents({ capitalUsdc: 1000, paperTrading: false, chainId: 137 }, core);

      expect(core.adapter).toBe(mockAdapter);
      expect(core.orderManager).not.toBeNull();
    });

    it('leaves adapter null when paper trading produces no adapter', () => {
      vi.spyOn(adapterModule, 'buildPolymarketAdapter').mockReturnValue({
        adapter: null,
        signer: null as never,
        mode: 'PAPER',
      });

      const core = buildCoreComponents({ capitalUsdc: 1000, paperTrading: true });
      buildStartComponents({ capitalUsdc: 1000, paperTrading: true }, core);

      expect(core.adapter).toBeNull();
      expect(core.orderManager).toBeNull();
    });
  });

  describe('persistOrchestratorState & restoreOrchestratorState error safety', () => {
    it('catches and logs error during persistence failure', async () => {
      const ctx = {
        journal: {
          savePositions: vi.fn().mockImplementation(() => {
            throw new Error('Disk full');
          }),
        },
        guard: {},
        positionTracker: {
          getPositions: vi.fn().mockReturnValue([]),
        },
      };

      await expect(persistOrchestratorState(ctx as never)).resolves.toBeUndefined();
    });

    it('persists circuit trip event when circuit is tripped', async () => {
      const recordEvent = vi.fn();
      const ctx = {
        journal: {
          savePositions: vi.fn(),
          getToday: vi.fn().mockReturnValue('2026-09-25'),
          saveDailyPnl: vi.fn(),
          recordEvent,
        },
        guard: {
          getStatus: vi.fn().mockReturnValue({
            totalWins: 2,
            totalLosses: 3,
            circuitTripped: true,
            consecutiveLosses: 3,
            dailyPnl: -150,
          }),
        },
        positionTracker: {
          getPositions: vi.fn().mockReturnValue([]),
          getSummary: vi.fn().mockReturnValue({ totalRealizedPnl: -150 }),
        },
      };

      await persistOrchestratorState(ctx as never);
      expect(recordEvent).toHaveBeenCalledWith('circuit_trip', {
        consecutiveLosses: 3,
        dailyPnl: -150,
      });
    });

    it('handles restore state day rollover and saved P&L', async () => {
      const resetDaily = vi.fn();
      const recordEvent = vi.fn();
      const ctx = {
        journal: {
          checkDayRollover: vi.fn().mockReturnValue('2026-09-24'),
          recordEvent,
          loadDailyPnl: vi.fn().mockResolvedValue({ realizedPnl: 50 }),
          loadPositions: vi.fn().mockResolvedValue([{ tokenId: 'tok-1' }]),
          getLifetimeStats: vi.fn().mockResolvedValue({ totalFills: 10 }),
          getToday: vi.fn().mockResolvedValue('2026-09-25'),
        },
        guard: {
          resetDaily,
        },
        positionTracker: {},
      };

      await restoreOrchestratorState(ctx as never);
      expect(resetDaily).toHaveBeenCalled();
      expect(recordEvent).toHaveBeenCalledWith('daily_reset', { prevDay: '2026-09-24' });
    });

    it('catches restore failure and logs warning without throwing', async () => {
      const ctx = {
        journal: {
          checkDayRollover: vi.fn().mockImplementation(() => {
            throw new Error('Corrupt state');
          }),
        },
        guard: {},
        positionTracker: {},
      };

      await expect(restoreOrchestratorState(ctx as never)).resolves.toBeUndefined();
    });
  });

  describe('LiveTradingOrchestrator Lifecycle & Trading Execution', () => {
    let orch: LiveTradingOrchestrator;

    beforeEach(() => {
      orch = new LiveTradingOrchestrator({
        capitalUsdc: 1000,
        paperTrading: true,
      });
    });

    it('returns initial status, mode, and diagnostics', () => {
      expect(orch.getStatus()).toBe('stopped');
      expect(orch.getMode()).toBe('PAPER');
      expect(orch.getPositions()).toEqual([]);
      expect(orch.getPositionSummary().positionCount).toBe(0);
      expect(orch.getGuardStatus()).toBeDefined();
      expect(orch.getActiveOrders()).toEqual([]);
      expect(orch.getJournal()).toBeDefined();
      expect(orch.getRiskManager()).toBeDefined();
      expect(orch.getPaperStats()).toBeDefined();
    });

    it('throws when getting orderbook in paper mode', () => {
      expect(() => orch.getOrderBook('tok-1')).toThrow('Orderbook only available in LIVE mode');
    });

    it('throws when submitting signal in paper mode (no orderManager)', async () => {
      await expect(
        orch.submitSignal(
          {
            signalId: 'sig-1',
            symbol: 'BTC/USDT',
            direction: 'BUY',
            confidence: 0.8,
            horizonMs: 5000,
            meta: {},
          },
          'test-strat'
        )
      ).rejects.toThrow('submitSignal only available in LIVE mode');
    });

    it('starts and stops gracefully in paper mode', async () => {
      const startSpy = vi.fn();
      const stopSpy = vi.fn();
      orch.on('started', startSpy);
      orch.on('stopped', stopSpy);

      await orch.start();
      expect(orch.getStatus()).toBe('running');
      expect(startSpy).toHaveBeenCalledWith({ mode: 'PAPER' });

      // Multiple starts are no-ops
      await orch.start();

      await orch.stop();
      expect(orch.getStatus()).toBe('stopped');
      expect(stopSpy).toHaveBeenCalled();

      // Multiple stops are no-ops
      await orch.stop();
    });

    it('handles start error by setting status to error and throwing', async () => {
      vi.spyOn(adapterModule, 'buildPolymarketAdapter').mockImplementationOnce(() => {
        throw new Error('Fatal adapter error');
      });

      await expect(orch.start()).rejects.toThrow('Fatal adapter error');
      expect(orch.getStatus()).toBe('error');
    });

    it('places paper order successfully when running', async () => {
      await orch.start();
      const dummyOrder: PolymarketOrder = {
        maker: '0x123',
        taker: '0x000',
        tokenId: '1234567890123456',
        makerAmount: '1000000',
        takerAmount: '500000',
        side: 0,
        feeRateBps: '0',
        nonce: '1',
        signer: '0x123',
        expiration: '1700000000',
        signatureType: 0,
        signature: '0xabc',
      };

      const res = await orch.placeOrder(dummyOrder);
      expect(res.status).toBe('matched');
      expect(res.orderID).toMatch(/^paper-/);
    });

    it('rejects order placement when not running', async () => {
      const dummyOrder: PolymarketOrder = {
        maker: '0x123',
        taker: '0x000',
        tokenId: '1234567890123456',
        makerAmount: '1000000',
        takerAmount: '500000',
        side: 0,
        feeRateBps: '0',
        nonce: '1',
        signer: '0x123',
        expiration: '1700000000',
        signatureType: 0,
        signature: '0xabc',
      };

      await expect(orch.placeOrder(dummyOrder)).rejects.toThrow('Orchestrator not running');
    });

    it('rejects order placement when guard rejects', async () => {
      await orch.start();
      const guard = (orch as never)['guard'] as { guardOrder: ReturnType<typeof vi.fn> };
      vi.spyOn(guard, 'guardOrder').mockReturnValueOnce({
        approved: false,
        reason: 'Drawdown limit breached',
      });

      const dummyOrder: PolymarketOrder = {
        maker: '0x123',
        taker: '0x000',
        tokenId: '1234567890123456',
        makerAmount: '1000000',
        takerAmount: '500000',
        side: 0,
        feeRateBps: '0',
        nonce: '1',
        signer: '0x123',
        expiration: '1700000000',
        signatureType: 0,
        signature: '0xabc',
      };

      await expect(orch.placeOrder(dummyOrder)).rejects.toThrow('Guard rejected: Drawdown limit breached');
    });

    it('handles executeStrategyTick allowed and skipped scenarios', async () => {
      const riskManager = orch.getRiskManager();
      const checkSpy = vi.spyOn(riskManager, 'check');

      // 1. Allowed scenario
      checkSpy.mockResolvedValueOnce({ allowed: true });
      const tickFn = vi.fn().mockResolvedValue(undefined);
      await orch.executeStrategyTick('strat-1', tickFn);
      expect(tickFn).toHaveBeenCalled();

      // 2. Allowed scenario with tickFn throwing
      checkSpy.mockResolvedValueOnce({ allowed: true });
      const failingTick = vi.fn().mockRejectedValue(new Error('Tick exploded'));
      await expect(orch.executeStrategyTick('strat-1', failingTick)).resolves.toBeUndefined();

      // 3. Disallowed scenario
      checkSpy.mockResolvedValueOnce({ allowed: false, reason: 'Circuit tripped' });
      const skippedTick = vi.fn();
      await orch.executeStrategyTick('strat-1', skippedTick);
      expect(skippedTick).not.toHaveBeenCalled();
    });

    it('updates paper PnL and retrieves paper stats', () => {
      orch.updatePaperPnl('test-strat', 25.5);
      const stats = orch.getPaperStats();
      expect(stats.get('test-strat')?.paperPnl).toBe(25.5);
    });

    it('processes price updates from tradingEventBus when running', async () => {
      await orch.start();
      // Manually subscribe to test event reception
      (orch as never)['subscribeToPriceUpdates']();

      tradingEventBus.emit('PRICE_UPDATE', {
        tokenId: 'token-xyz',
        bid: 0.45,
        ask: 0.47,
        mid: 0.46,
        timestamp: Date.now(),
      });

      // Price update with 0 bid/ask should be ignored
      tradingEventBus.emit('PRICE_UPDATE', {
        tokenId: 'token-xyz',
        bid: 0,
        ask: 0,
        mid: 0,
        timestamp: Date.now(),
      });

      await orch.stop();
    });

    it('handles live mode start with adapter and orderManager actions', async () => {
      const mockOrderManager = {
        stop: vi.fn().mockResolvedValue(undefined),
        submitAndTrack: vi.fn().mockResolvedValue({ orderID: 'live-123', status: 'matched' }),
        cancelOrder: vi.fn().mockResolvedValue(undefined),
        getActiveOrders: vi.fn().mockReturnValue([{ orderId: 'ord-active' }]),
        submitSignal: vi.fn().mockResolvedValue({ orderID: 'live-sig-123', status: 'matched' }),
      };

      const mockAdapter = {
        getOrderBook: vi.fn().mockResolvedValue({ bids: [], asks: [] }),
      };

      vi.spyOn(adapterModule, 'buildPolymarketAdapter').mockReturnValue({
        adapter: mockAdapter as never,
        signer: null as never,
        mode: 'LIVE',
      });

      const liveOrch = new LiveTradingOrchestrator({
        capitalUsdc: 10000,
        paperTrading: false,
      });

      await liveOrch.start();
      (liveOrch as never)['orderManager'] = mockOrderManager as never;

      expect(liveOrch.getActiveOrders()).toEqual([{ orderId: 'ord-active' }]);
      await expect(liveOrch.getOrderBook('tok-live')).resolves.toEqual({ bids: [], asks: [] });

      const liveOrderRes = await liveOrch.placeOrder({
        maker: '0x123',
        taker: '0x000',
        tokenId: '1234567890123456',
        makerAmount: '1000000',
        takerAmount: '500000',
        side: 0,
        feeRateBps: '0',
        nonce: '1',
        signer: '0x123',
        expiration: '1700000000',
        signatureType: 0,
        signature: '0xabc',
      });
      expect(liveOrderRes.orderID).toBe('live-123');

      await liveOrch.cancelOrder('live-123');
      expect(mockOrderManager.cancelOrder).toHaveBeenCalledWith('live-123');

      const sigRes = await liveOrch.submitSignal(
        {
          signalId: 'sig-live-1',
          symbol: 'BTC/USDT',
          direction: 'BUY',
          confidence: 0.9,
          horizonMs: 1000,
          meta: {},
        },
        'strat-live'
      );
      expect(sigRes.orderID).toBe('live-sig-123');

      await liveOrch.stop();
      expect(mockOrderManager.stop).toHaveBeenCalled();
    });
  });
});

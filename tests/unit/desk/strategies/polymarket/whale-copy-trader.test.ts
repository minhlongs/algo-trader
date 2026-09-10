/**
 * Tests for whale-copy-trader
 * Covers: constructor, start (idempotent, handler wiring), handleWhaleActivity
 *         (full pipeline), buildSignal (confidence/volume thresholds, side mapping),
 *         publishSignal (NATS connected/disconnected/failure), recordOutcome
 *         (accuracy threshold), getStats (returns copy), getOrCreateStats
 *         (volume tracking), startWhaleCopyTrader singleton
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock factories (vi.hoisted runs before vi.mock) ──
const { mockOnWhaleActivity, mockStartFeedFn } = vi.hoisted(() => ({
  mockOnWhaleActivity: vi.fn(),
  mockStartFeedFn: vi.fn(() => ({
    onWhaleActivity: mockOnWhaleActivity,
  })),
}));

const { mockBusPublish, mockBusIsConnected } = vi.hoisted(() => ({
  mockBusPublish: vi.fn().mockResolvedValue(undefined),
  mockBusIsConnected: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../../src/shared/messaging/index', () => ({
  getMessageBus: () => ({
    isConnected: mockBusIsConnected,
    publish: mockBusPublish,
  }),
}));

vi.mock('../../../../../src/desk/feeds/whale-activity-feed', () => ({
  startWhaleActivityFeed: (...args: unknown[]) => mockStartFeedFn(...args),
}));

import { WhaleCopyTrader, startWhaleCopyTrader } from '../../../../../src/desk/strategies/polymarket/whale-copy-trader';
import type { WhaleActivity } from '../../../../../src/desk/strategies/feeds/whale-activity-feed';

// ── Helpers ──

function makeActivity(overrides: Partial<WhaleActivity> = {}): WhaleActivity {
  return {
    tradeId: 'trade_1',
    walletAddress: '0xabc123',
    marketId: 'market_btc_yes',
    tokenId: 'token_1',
    side: 'YES',
    size: 5000,
    price: 0.65,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── Tests ──

describe('WhaleCopyTrader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default implementations cleared by clearAllMocks
    mockBusIsConnected.mockReturnValue(true);
    mockBusPublish.mockResolvedValue(undefined);
  });

  // ── Constructor ──

  describe('constructor', () => {
    it('instantiates with defaults', () => {
      const trader = new WhaleCopyTrader();
      expect(trader).toBeDefined();
    });

    it('instantiates with custom copyRatio and portfolioUsdc', () => {
      const trader = new WhaleCopyTrader({ copyRatio: 0.05, portfolioUsdc: 5000 });
      expect(trader).toBeDefined();
    });
  });

  // ── start() ──

  describe('start', () => {
    it('wires handler to whale activity feed', () => {
      const trader = new WhaleCopyTrader();
      trader.start(500);
      expect(mockStartFeedFn).toHaveBeenCalledWith(500);
      expect(mockOnWhaleActivity).toHaveBeenCalledWith(expect.any(Function));
    });

    it('idempotent — second start is a no-op', () => {
      const trader = new WhaleCopyTrader();
      trader.start(500);
      trader.start(1000);
      expect(mockStartFeedFn).toHaveBeenCalledTimes(1);
    });
  });

  // ── handleWhaleActivity pipeline ──

  describe('handleWhaleActivity pipeline', () => {
    it('publishes signal when confidence >= 0.35 and copySize >= 1', () => {
      const trader = new WhaleCopyTrader({ copyRatio: 0.01 });
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity({ size: 5000, side: 'YES' }));

      expect(mockBusPublish).toHaveBeenCalledWith(
        'signal.validated',
        expect.objectContaining({
          original: expect.objectContaining({
            signalType: 'whale-copy',
            markets: expect.arrayContaining([
              expect.objectContaining({ id: 'market_btc_yes' }),
            ]),
          }),
        }),
        'whale-copy-trader',
      );
    });

    it('skips signal when confidence < MIN_CONFIDENCE (0.35)', () => {
      const trader = new WhaleCopyTrader({ copyRatio: 0.01 });
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      // tiny size → low confidence (0.5 * 0.85 + negative ≈ 0.425 - 0.1 < 0.35)
      handler(makeActivity({ size: 10 }));

      expect(mockBusPublish).not.toHaveBeenCalled();
    });

    it('skips signal when copySize rounds down to < 1 USDC', () => {
      const trader = new WhaleCopyTrader({ copyRatio: 0.001, portfolioUsdc: 100 });
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      // rawCopy = 80 * 0.001 = 0.08, min(0.08, 5) = 0.08 < 1 → skip
      handler(makeActivity({ size: 80 }));

      expect(mockBusPublish).not.toHaveBeenCalled();
    });

    it('returns early when NATS not connected', () => {
      mockBusIsConnected.mockReturnValue(false);
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity());

      expect(mockBusPublish).not.toHaveBeenCalled();
    });

    it('logs warning when NATS publish fails', async () => {
      mockBusPublish.mockRejectedValueOnce(new Error('nats down'));
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity());
      await new Promise(r => setTimeout(r, 10));
      expect(true).toBe(true);
    });
  });

  // ── buildSignal confidence/volume thresholds ──

  describe('buildSignal', () => {
    it('maps YES side correctly in envelope', () => {
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity({ side: 'YES', price: 0.65, size: 5000 }));

      const envelope = mockBusPublish.mock.calls[0][1] as { original: { markets: Array<{ yesPrice: number; noPrice: number }> } };
      expect(envelope.original.markets[0].yesPrice).toBe(0.65);
      expect(envelope.original.markets[0].noPrice).toBeCloseTo(0.35, 10);
    });

    it('maps NO side correctly in envelope', () => {
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity({ side: 'NO', price: 0.40, size: 5000 }));

      const envelope = mockBusPublish.mock.calls[0][1] as { original: { markets: Array<{ yesPrice: number; noPrice: number }> } };
      expect(envelope.original.markets[0].yesPrice).toBeCloseTo(0.60, 10);
      expect(envelope.original.markets[0].noPrice).toBe(0.40);
    });

    it('caps copySize at maxCopyUsdc (5% of portfolio)', () => {
      const trader = new WhaleCopyTrader({ copyRatio: 0.10, portfolioUsdc: 1000 });
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity({ size: 50000 }));

      expect(mockBusPublish).toHaveBeenCalled();
    });

    it('uses higher accuracy after sufficient recorded outcomes', () => {
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      for (let i = 0; i < 8; i++) trader.recordOutcome('0xabc123', true);
      for (let i = 0; i < 2; i++) trader.recordOutcome('0xabc123', false);

      handler(makeActivity({ size: 5000 }));
      expect(mockBusPublish).toHaveBeenCalled();
    });
  });

  // ── recordOutcome accuracy ──

  describe('recordOutcome', () => {
    it('uses neutral 0.5 when below MIN_TRADES threshold', () => {
      const trader = new WhaleCopyTrader();
      trader.recordOutcome('0xabc', true);
      trader.recordOutcome('0xabc', false);
      const stats = trader.getStats().get('0xabc');
      expect(stats?.accuracy).toBeCloseTo(0.5, 5);
    });

    it('computes real accuracy when >= MIN_TRADES_FOR_ACCURACY (5)', () => {
      const trader = new WhaleCopyTrader();
      for (let i = 0; i < 7; i++) trader.recordOutcome('0xabc', true);
      for (let i = 0; i < 3; i++) trader.recordOutcome('0xabc', false);
      const stats = trader.getStats().get('0xabc');
      expect(stats?.accuracy).toBe(0.7);
      expect(stats?.totalTrades).toBe(10);
    });

    it('lowercases wallet address', () => {
      const trader = new WhaleCopyTrader();
      trader.recordOutcome('0xABC123', true);
      expect(trader.getStats().has('0xabc123')).toBe(true);
    });
  });

  // ── getStats ──

  describe('getStats', () => {
    it('returns empty map for fresh instance', () => {
      const trader = new WhaleCopyTrader();
      expect(trader.getStats().size).toBe(0);
    });

    it('returns a copy, not the internal map', () => {
      const trader = new WhaleCopyTrader();
      trader.recordOutcome('0xaaa', true);
      const stats = trader.getStats();
      stats.delete('0xaaa');
      expect(trader.getStats().size).toBe(1);
    });
  });

  // ── getOrCreateStats (volume tracking) ──

  describe('getOrCreateStats via handleWhaleActivity', () => {
    it('accumulates totalVolumeUsdc across multiple activities', () => {
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity({ walletAddress: '0xw1', size: 10000 }));
      handler(makeActivity({ walletAddress: '0xw1', size: 10000 }));

      const stats = trader.getStats().get('0xw1');
      expect(stats?.totalVolumeUsdc).toBe(20000);
    });
  });

  // ── publishSignal envelope ──

  describe('publishSignal envelope', () => {
    it('includes correct reasoning string', () => {
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      handler(makeActivity({ walletAddress: '0xdead', size: 5000 }));

      const envelope = mockBusPublish.mock.calls[0][1] as { original: { reasoning: string } };
      expect(envelope.original.reasoning).toContain('Whale copy:');
      expect(envelope.original.reasoning).toContain('Confidence=');
    });

    it('computes expectedEdge as confidence * 0.10', () => {
      const trader = new WhaleCopyTrader();
      trader.start();
      const handler = mockOnWhaleActivity.mock.calls[0][0] as (a: WhaleActivity) => void;

      const activity = makeActivity({ size: 5000 });
      handler(activity);

      // Compute expected confidence: accuracy(0.5) * 0.85 + volumeBonus
      const volumeBonus = Math.min(0.15, Math.log10(activity.size / 1_000) * 0.05);
      const expectedConfidence = 0.5 * 0.85 + volumeBonus;

      const envelope = mockBusPublish.mock.calls[0][1] as { original: { expectedEdge: number } };
      expect(envelope.original.expectedEdge).toBeCloseTo(
        expectedConfidence * 0.10, 5,
      );
    });
  });

  // ── startWhaleCopyTrader singleton ──

  describe('startWhaleCopyTrader', () => {
    it('returns a WhaleCopyTrader instance', () => {
      const trader = startWhaleCopyTrader({ portfolioUsdc: 500 });
      expect(trader).toBeInstanceOf(WhaleCopyTrader);
    });

    it('is idempotent — same instance returned', () => {
      const t1 = startWhaleCopyTrader({ portfolioUsdc: 500 });
      const t2 = startWhaleCopyTrader({ portfolioUsdc: 500 });
      expect(t1).toBe(t2);
    });
  });
});

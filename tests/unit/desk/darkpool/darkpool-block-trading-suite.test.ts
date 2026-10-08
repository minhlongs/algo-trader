import { describe, it, expect } from 'vitest';
import { CrossingEngine } from '../../../../src/desk/darkpool/crossing-engine';
import { AntiGamingGuard } from '../../../../src/desk/darkpool/anti-gaming-guard';
import { IoiDistributionRelayer } from '../../../../src/desk/darkpool/ioi-distribution-relayer';

describe('Dark Pool & Block Trading Gateway Suite', () => {
  describe('CrossingEngine', () => {
    it('matches midpoint pegged orders and enforces minimum execution quantity', () => {
      const engine = new CrossingEngine();

      engine.submitOrder({
        orderId: 'buy-1',
        participantId: 'p1',
        symbol: 'BTC/USD',
        side: 'BUY',
        quantity: 10,
        minExecutionQuantity: 5,
        pegType: 'MIDPOINT',
        timestampMs: 1000,
      });

      // Small sell below minimum execution quantity
      engine.submitOrder({
        orderId: 'sell-small',
        participantId: 'p2',
        symbol: 'BTC/USD',
        side: 'SELL',
        quantity: 2,
        pegType: 'MIDPOINT',
        timestampMs: 1005,
      });

      const firstCross = engine.executeCross('BTC/USD', 65000, 65010, 1010);
      expect(firstCross.length).toBe(0);

      // Block sell fulfilling min execution quantity
      engine.submitOrder({
        orderId: 'sell-block',
        participantId: 'p3',
        symbol: 'BTC/USD',
        side: 'SELL',
        quantity: 8,
        minExecutionQuantity: 5,
        pegType: 'MIDPOINT',
        timestampMs: 1020,
      });

      const secondCross = engine.executeCross('BTC/USD', 65000, 65010, 1025);
      expect(secondCross.length).toBe(1);
      expect(secondCross[0]?.executionPrice).toBe(65005);
      expect(secondCross[0]?.matchedQuantity).toBe(8);

      // Verify that filled sell order was pruned and remaining buy order (2 BTC) is kept
      expect(engine.getActiveOrderCount()).toBe(2); // buy-1 (2 remaining), sell-small (2 remaining)
    });

    it('enforces maximum order capacity', () => {
      const engine = new CrossingEngine(2);
      expect(
        engine.submitOrder({
          orderId: 'b1',
          participantId: 'p1',
          symbol: 'BTC/USD',
          side: 'BUY',
          quantity: 1,
          pegType: 'MIDPOINT',
          timestampMs: 1000,
        })
      ).toBe(true);
      expect(
        engine.submitOrder({
          orderId: 'b2',
          participantId: 'p2',
          symbol: 'BTC/USD',
          side: 'BUY',
          quantity: 1,
          pegType: 'MIDPOINT',
          timestampMs: 1001,
        })
      ).toBe(true);
      // Exceeds capacity
      expect(
        engine.submitOrder({
          orderId: 'b3',
          participantId: 'p3',
          symbol: 'BTC/USD',
          side: 'BUY',
          quantity: 1,
          pegType: 'MIDPOINT',
          timestampMs: 1002,
        })
      ).toBe(false);
    });
  });

  describe('AntiGamingGuard', () => {
    it('detects small-order sniffing patterns and throttles high cancellation rates', () => {
      const guard = new AntiGamingGuard({
        smallOrderSniffingThreshold: 5,
        cancellationRatioThreshold: 0.8,
      });

      // 6 consecutive tiny orders
      for (let i = 0; i < 5; i++) {
        guard.validateOrder({
          orderId: `ping-${i}`,
          participantId: 'hft-adversary',
          symbol: 'ETH/USD',
          side: 'BUY',
          quantity: 1,
          pegType: 'MIDPOINT',
          timestampMs: 1000 + i * 100,
        });
      }

      const blockedPing = guard.validateOrder({
        orderId: 'ping-toxic',
        participantId: 'hft-adversary',
        symbol: 'ETH/USD',
        side: 'BUY',
        quantity: 1,
        pegType: 'MIDPOINT',
        timestampMs: 2000,
      });
      expect(blockedPing.isAllowed).toBe(false);
      expect(blockedPing.reason).toContain('sniffing');
    });

    it('rejects orders with non-monotonic timestamps', () => {
      const guard = new AntiGamingGuard();
      const first = guard.validateOrder({
        orderId: 'o1',
        participantId: 'trader1',
        symbol: 'BTC/USD',
        side: 'BUY',
        quantity: 20,
        pegType: 'MIDPOINT',
        timestampMs: 5000,
      });
      expect(first.isAllowed).toBe(true);

      const backwards = guard.validateOrder({
        orderId: 'o2',
        participantId: 'trader1',
        symbol: 'BTC/USD',
        side: 'BUY',
        quantity: 20,
        pegType: 'MIDPOINT',
        timestampMs: 4000,
      });
      expect(backwards.isAllowed).toBe(false);
      expect(backwards.reason).toContain('non-monotonic');
    });
  });

  describe('IoiDistributionRelayer', () => {
    it('disseminates non-attributable IOIs and filters by size tiers', () => {
      const relayer = new IoiDistributionRelayer();
      const future = Date.now() + 60_000;

      relayer.broadcastIoi({
        ioiId: 'ioi-1',
        symbol: 'SOL/USD',
        side: 'BUY',
        sizeTier: 'SMALL',
        naturalInterest: true,
        expiryTimestampMs: future,
      });

      relayer.broadcastIoi({
        ioiId: 'ioi-2',
        symbol: 'SOL/USD',
        side: 'BUY',
        sizeTier: 'BLOCK',
        naturalInterest: true,
        expiryTimestampMs: future,
      });

      const all = relayer.getFilteredIois('SOL/USD');
      expect(all.length).toBe(2);

      const blockOnly = relayer.getFilteredIois('SOL/USD', 'BLOCK');
      expect(blockOnly.length).toBe(1);
      expect(blockOnly[0]?.ioiId).toBe('ioi-2');
    });
  });
});

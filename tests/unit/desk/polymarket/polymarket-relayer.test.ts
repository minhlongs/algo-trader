import { describe, it, expect, vi } from 'vitest';
import { PolymarketRelayerEngine } from '../../../../src/desk/polymarket/polymarket-relayer-engine';
import { PolymarketSettlementListener } from '../../../../src/desk/polymarket/polymarket-settlement-listener';
import { PortfolioTelemetryHub } from '../../../../src/desk/telemetry/portfolio-telemetry-hub';

describe('Polymarket Relayer & Settlement Engine', () => {
  const testPrivateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  describe('PolymarketRelayerEngine', () => {
    it('creates valid EIP-712 typed order signatures for EOA / Proxy / Safe', async () => {
      const relayer = new PolymarketRelayerEngine(testPrivateKey, { chainId: 137 });
      expect(relayer.getAddress()).toMatch(/^0x[a-fA-F0-9]{40}$/);

      const orderEOA = await relayer.buildAndSignOrder({
        tokenId: '1234567890',
        price: 0.55,
        size: 100,
        side: 'BUY',
        signatureType: 0,
      });

      expect(orderEOA.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
      expect(orderEOA.maker.toLowerCase()).toBe(relayer.getAddress().toLowerCase());
      expect(orderEOA.signatureType).toBe(0);

      const orderSafe = await relayer.buildAndSignOrder({
        tokenId: '1234567890',
        price: 0.45,
        size: 200,
        side: 'SELL',
        signatureType: 2,
      });
      expect(orderSafe.signatureType).toBe(2);
      expect(orderSafe.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it('syncs nonce from relayer API or increments locally', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ nonce: 42 }),
      } as Response);

      const relayer = new PolymarketRelayerEngine(testPrivateKey, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const synced = await relayer.syncNonce();
      expect(synced).toBe(43);

      const nextNonce = await relayer.getNextNonce();
      expect(nextNonce).toContain('44');
    });

    it('executes gasless order submission with latency measurement', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          orderId: 'poly-order-999',
          status: 'MATCHED',
          transactionHash: '0xmocktx123',
        }),
      } as Response);

      const relayer = new PolymarketRelayerEngine(testPrivateKey, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await relayer.executeGaslessOrder({
        tokenId: '987654321',
        price: 0.60,
        size: 50,
        side: 'BUY',
      });

      expect(res.orderId).toBe('poly-order-999');
      expect(res.status).toBe('MATCHED');
      expect(res.transactionHash).toBe('0xmocktx123');
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('handles relayer HTTP errors gracefully without throwing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'insufficient allowance',
      } as Response);

      const relayer = new PolymarketRelayerEngine(testPrivateKey, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await relayer.executeGaslessOrder({
        tokenId: '987654321',
        price: 0.60,
        size: 50,
        side: 'BUY',
      });

      expect(res.status).toBe('FAILED');
      expect(res.error).toContain('insufficient allowance');
    });
  });

  describe('PolymarketSettlementListener', () => {
    it('realizes winning position payout into portfolio telemetry state on market_resolved', () => {
      const hub = new PortfolioTelemetryHub({ initialCashUsd: 10000 });
      const listener = new PolymarketSettlementListener({ portfolioHub: hub, defaultEngineId: 'arbitrage' });

      listener.trackPosition({
        positionId: 'pos-1',
        conditionId: '0xcond1',
        tokenId: '0xtoken-yes',
        outcomeIndex: 0,
        entryPrice: 0.40,
        size: 1000,
        engineId: 'arbitrage',
      });

      expect(listener.getTrackedPositions().length).toBe(1);

      const settlements = listener.handleMarketResolved({
        conditionId: '0xcond1',
        winningOutcomeIndex: 0,
        winningTokenId: '0xtoken-yes',
        payoutNumerators: [1, 0],
        payoutDenominator: 1,
        timestamp: Date.now(),
      });

      expect(settlements.length).toBe(1);
      const s = settlements[0];
      expect(s.won).toBe(true);
      expect(s.payoutUsd).toBe(1000);
      expect(s.costBasisUsd).toBe(400);
      expect(s.realizedPnlUsd).toBe(600); // 1000 - 400

      // Position should be removed from tracking
      expect(listener.getTrackedPositions().length).toBe(0);

      // Hub snapshot should reflect realized PnL
      const snapshot = hub.getConsolidatedSnapshot();
      expect(snapshot.engineSnapshots.arbitrage.realizedPnlUsd).toBe(600);
    });

    it('realizes losing position loss into portfolio telemetry state on market_resolved', () => {
      const hub = new PortfolioTelemetryHub({ initialCashUsd: 10000 });
      const listener = new PolymarketSettlementListener({ portfolioHub: hub, defaultEngineId: 'arbitrage' });

      listener.trackPosition({
        positionId: 'pos-2',
        conditionId: '0xcond2',
        tokenId: '0xtoken-no',
        outcomeIndex: 1,
        entryPrice: 0.35,
        size: 500,
        engineId: 'arbitrage',
      });

      const settlements = listener.handleMarketResolved({
        conditionId: '0xcond2',
        winningOutcomeIndex: 0,
        winningTokenId: '0xtoken-yes',
        payoutNumerators: [1, 0],
        payoutDenominator: 1,
        timestamp: Date.now(),
      });

      expect(settlements.length).toBe(1);
      const s = settlements[0];
      expect(s.won).toBe(false);
      expect(s.payoutUsd).toBe(0);
      expect(s.costBasisUsd).toBe(175); // 500 * 0.35
      expect(s.realizedPnlUsd).toBe(-175);

      const snapshot = hub.getConsolidatedSnapshot();
      expect(snapshot.engineSnapshots.arbitrage.realizedPnlUsd).toBe(-175);
    });

    it('processes CTF on-chain payout events', () => {
      const hub = new PortfolioTelemetryHub({ initialCashUsd: 10000 });
      const listener = new PolymarketSettlementListener({ portfolioHub: hub });

      listener.trackPosition({
        positionId: 'pos-3',
        conditionId: '0xcond3',
        tokenId: '0xtoken-ctf',
        outcomeIndex: 0,
        entryPrice: 0.50,
        size: 200,
      });

      const settlements = listener.handleCtfPayout({
        conditionId: '0xcond3',
        stakeholder: '0xmaker',
        collateralToken: '0xusdc',
        parentCollectionId: '0x0',
        indexSets: ['1'],
        payoutAmount: 200,
        timestamp: Date.now(),
      });

      expect(settlements.length).toBe(1);
      expect(settlements[0].realizedPnlUsd).toBe(100); // 200 - (200*0.5)
      expect(settlements[0].won).toBe(true);
    });
  });
});

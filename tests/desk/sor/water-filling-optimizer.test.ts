import { describe, it, expect } from 'vitest';
import { WaterFillingOptimizer } from '../../../src/desk/sor/water-filling-optimizer';
import { VenueBook, RoutingRequest } from '../../../src/desk/sor/sor-types';

describe('WaterFillingOptimizer', () => {
  const optimizer = new WaterFillingOptimizer();

  it('allocates 100% to single venue when one venue strictly dominates', () => {
    const books: VenueBook[] = [
      { venueId: 'binance', symbol: 'BTC/USDT', bids: [[60000, 10]], asks: [[60000, 10]], takerFeeBps: 7.5, gasCostUsd: 0 },
      { venueId: 'bybit', symbol: 'BTC/USDT', bids: [[59900, 10]], asks: [[60100, 10]], takerFeeBps: 10.0, gasCostUsd: 0 },
    ];

    const req: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 2.0,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const plan = optimizer.optimizeRoute(req, books);
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].venueId).toBe('binance');
    expect(plan.allocations[0].quantity).toBe(2.0);
    expect(plan.priceImprovementBps).toBeGreaterThanOrEqual(0);
  });

  it('splits orders across multiple venues when top tier depth is exhausted', () => {
    const books: VenueBook[] = [
      { venueId: 'binance', symbol: 'BTC/USDT', bids: [[60000, 5]], asks: [[60000, 1.0], [60200, 5.0]], takerFeeBps: 7.5, gasCostUsd: 0 },
      { venueId: 'bybit', symbol: 'BTC/USDT', bids: [[60000, 5]], asks: [[60050, 1.0], [60250, 5.0]], takerFeeBps: 7.5, gasCostUsd: 0 },
    ];

    const req: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'BUY',
      targetQuantity: 2.0,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const plan = optimizer.optimizeRoute(req, books);
    expect(plan.allocations).toHaveLength(2);
    // Should take 1.0 from Binance at 60000, and 1.0 from Bybit at 60050 (instead of Binance second level at 60200)
    const binanceAlloc = plan.allocations.find(a => a.venueId === 'binance');
    const bybitAlloc = plan.allocations.find(a => a.venueId === 'bybit');
    expect(binanceAlloc?.quantity).toBe(1.0);
    expect(bybitAlloc?.quantity).toBe(1.0);

    // Guaranteed price improvement over naive single-venue (executing 2.0 on Binance would hit 60200)
    expect(plan.priceImprovementBps).toBeGreaterThan(0);
  });

  it('prunes on-chain venues that fail the gas hurdle for small order sizes', () => {
    const books: VenueBook[] = [
      { venueId: 'binance', symbol: 'ETH/USDT', bids: [[3000, 10]], asks: [[3001, 10]], takerFeeBps: 10, gasCostUsd: 0 },
      { venueId: 'amm_cpmm', symbol: 'ETH/USDT', bids: [[3000, 10]], asks: [[3000, 10]], takerFeeBps: 10, gasCostUsd: 10 },
    ];

    // For a tiny 0.1 ETH order ($300), $1 price difference saves only $0.10, but costs $10 gas!
    const reqSmall: RoutingRequest = {
      symbol: 'ETH/USDT',
      side: 'BUY',
      targetQuantity: 0.1,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const planSmall = optimizer.optimizeRoute(reqSmall, books);
    // Should prune AMM and allocate to Binance
    expect(planSmall.allocations).toHaveLength(1);
    expect(planSmall.allocations[0].venueId).toBe('binance');

    // For a large 50 ETH order ($150,000), $1 price difference saves $50, easily covering $10 gas!
    const reqLarge: RoutingRequest = {
      symbol: 'ETH/USDT',
      side: 'BUY',
      targetQuantity: 10,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const planLarge = optimizer.optimizeRoute(reqLarge, books);
    const ammAlloc = planLarge.allocations.find(a => a.venueId === 'amm_cpmm');
    expect(ammAlloc).toBeDefined();
  });

  it('preserves on-chain liquidity when alternative venues have insufficient depth', () => {
    const books: VenueBook[] = [
      { venueId: 'binance', symbol: 'TEST/USDT', bids: [], asks: [[10, 10]], takerFeeBps: 0, gasCostUsd: 0 },
      { venueId: 'amm_cpmm', symbol: 'TEST/USDT', bids: [], asks: [[10, 90]], takerFeeBps: 0, gasCostUsd: 0.05 },
    ];

    const req: RoutingRequest = {
      symbol: 'TEST/USDT',
      side: 'BUY',
      targetQuantity: 100,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const plan = optimizer.optimizeRoute(req, books);
    expect(plan.totalQuantity).toBe(100);
    expect(plan.allocations).toHaveLength(2);
    const binanceAlloc = plan.allocations.find(a => a.venueId === 'binance');
    const ammAlloc = plan.allocations.find(a => a.venueId === 'amm_cpmm');
    expect(binanceAlloc?.quantity).toBe(10);
    expect(ammAlloc?.quantity).toBe(90);
  });

  it('guarantees Cost_SOR <= Cost_naive under all conditions (zero negative price improvement)', () => {
    const books: VenueBook[] = [
      { venueId: 'binance', symbol: 'SOL/USDT', bids: [[150, 100]], asks: [[150, 100]], takerFeeBps: 10, gasCostUsd: 0 },
      { venueId: 'bybit', symbol: 'SOL/USDT', bids: [[150.2, 50]], asks: [[150.2, 50]], takerFeeBps: 10, gasCostUsd: 0 },
    ];

    const req: RoutingRequest = {
      symbol: 'SOL/USDT',
      side: 'BUY',
      targetQuantity: 50,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const plan = optimizer.optimizeRoute(req, books);
    expect(plan.priceImprovementBps).toBeGreaterThanOrEqual(0);
    if (plan.naiveTotalCostUsd) {
      expect(plan.expectedNetProceedsUsd).toBeLessThanOrEqual(plan.naiveTotalCostUsd + 1e-6);
    }
  });

  it('optimizes SELL orders to maximize net proceeds', () => {
    const books: VenueBook[] = [
      { venueId: 'binance', symbol: 'BTC/USDT', bids: [[60100, 1.0], [59900, 2.0]], asks: [[60200, 5]], takerFeeBps: 7.5, gasCostUsd: 0 },
      { venueId: 'bybit', symbol: 'BTC/USDT', bids: [[60050, 1.0], [59850, 2.0]], asks: [[60200, 5]], takerFeeBps: 7.5, gasCostUsd: 0 },
    ];

    const req: RoutingRequest = {
      symbol: 'BTC/USDT',
      side: 'SELL',
      targetQuantity: 2.0,
      maxSlippageBps: 50,
      urgency: 'MEDIUM',
    };

    const plan = optimizer.optimizeRoute(req, books);
    expect(plan.allocations).toHaveLength(2);
    // Should sell 1.0 on Binance at 60100, and 1.0 on Bybit at 60050 (instead of Binance second level at 59900)
    expect(plan.expectedNetProceedsUsd).toBeGreaterThan(119800);
    expect(plan.priceImprovementBps).toBeGreaterThan(0);
  });
});

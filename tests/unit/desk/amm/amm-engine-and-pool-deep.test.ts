/**
 * Deep unit tests for AmmEngine, MultiTokenPool, and HybridOrderRouter
 */

import { describe, it, expect } from 'vitest';
import { AmmEngine } from '../../../../src/desk/amm/engine/amm-engine';
import { MultiTokenPool } from '../../../../src/desk/amm/pool/multi-token-pool';
import { HybridOrderRouter } from '../../../../src/desk/amm/pool/hybrid-order-router';
import { OrderbookSnapshot, OutcomeToken } from '../../../../src/desk/amm/types/amm-types';
import { RiskContext } from '../../../../src/desk/amm/types/risk-types';

const sampleOutcomes2: OutcomeToken[] = [
  { index: 0, symbol: 'YES', name: 'Yes Token', tokenId: 't0' },
  { index: 1, symbol: 'NO', name: 'No Token', tokenId: 't1' },
];

const sampleOutcomes3: OutcomeToken[] = [
  { index: 0, symbol: 'O0', name: 'Outcome 0', tokenId: 't0' },
  { index: 1, symbol: 'O1', name: 'Outcome 1', tokenId: 't1' },
  { index: 2, symbol: 'O2', name: 'Outcome 2', tokenId: 't2' },
];

describe('MultiTokenPool Deep Branch Coverage', () => {
  it('throws on CPMM with non-2 outcomes', () => {
    expect(() =>
      new MultiTokenPool({
        poolId: 'p-bad',
        pricingModel: 'CPMM',
        outcomes: sampleOutcomes3,
      })
    ).toThrow('CPMM model requires exactly 2 outcomes');
  });

  it('handles CPMM pool creation, trade execution for BUY, SELL, and SWAP with fees', () => {
    const cpmmPool = new MultiTokenPool({
      poolId: 'p-cpmm',
      pricingModel: 'CPMM',
      outcomes: sampleOutcomes2,
      initialCpmmReserves: { yes: 500, no: 500 },
      feeBps: 20,
    });

    expect(cpmmPool.getCpmmReserves()).toBeDefined();

    // Buy YES
    const buyRes = cpmmPool.executeTrade({
      poolId: 'p-cpmm',
      outcomeIndex: 0,
      action: 'BUY',
      amount: 50,
    });
    expect(buyRes.outputAmount).toBeGreaterThan(0);
    expect(buyRes.feePaidUsdc).toBeGreaterThan(0);

    // Sell YES
    const sellRes = cpmmPool.executeTrade({
      poolId: 'p-cpmm',
      outcomeIndex: 0,
      action: 'SELL',
      amount: 20,
    });
    expect(sellRes.outputAmount).toBeGreaterThan(0);

    // Swap (action !== BUY && action !== SELL)
    const swapRes = cpmmPool.executeTrade({
      poolId: 'p-cpmm',
      outcomeIndex: 1,
      action: 'SWAP' as any,
      amount: 10,
    });
    expect(swapRes.outputAmount).toBeGreaterThan(0);
  });

  it('handles LMSR pool trade execution for BUY and SELL with fees', () => {
    const lmsrPool = new MultiTokenPool({
      poolId: 'p-lmsr',
      pricingModel: 'LMSR',
      outcomes: sampleOutcomes3,
      b: 500,
      feeBps: 10,
    });

    expect(lmsrPool.getB()).toBe(500);
    lmsrPool.setB(600);
    expect(lmsrPool.getB()).toBe(600);
    expect(() => lmsrPool.setB(0)).toThrow('b must be positive');

    // Buy
    const buyRes = lmsrPool.executeTrade({
      poolId: 'p-lmsr',
      outcomeIndex: 1,
      action: 'BUY',
      amount: 100,
    });
    expect(buyRes.outputAmount).toBeGreaterThan(0);

    // Sell
    const sellRes = lmsrPool.executeTrade({
      poolId: 'p-lmsr',
      outcomeIndex: 1,
      action: 'SELL',
      amount: 10,
    });
    expect(sellRes.outputAmount).toBeGreaterThan(0);

    // Mint and merge complete sets
    const mintRes = lmsrPool.mintCompleteSets(50);
    expect(mintRes.operation).toBe('MINT');
    expect(mintRes.setCount).toBe(50);

    const mergeRes = lmsrPool.mergeCompleteSets(20);
    expect(mergeRes.operation).toBe('MERGE');
    expect(mergeRes.setCount).toBe(20);

    expect(lmsrPool.getReserves().length).toBe(3);
    expect(lmsrPool.getCollateralReserve()).toBeGreaterThan(0);
  });

  it('throws on out-of-bounds outcomeIndex in executeTrade', () => {
    const pool = new MultiTokenPool({
      poolId: 'p-1',
      outcomes: sampleOutcomes2,
    });
    expect(() =>
      pool.executeTrade({
        poolId: 'p-1',
        outcomeIndex: 99,
        action: 'BUY',
        amount: 50,
      })
    ).toThrow('Invalid outcome index');
  });
});

describe('HybridOrderRouter Deep Branch Coverage', () => {
  it('routes BUY order across CLOB asks and AMM pool', () => {
    const pool = new MultiTokenPool({
      poolId: 'pool-router-1',
      outcomes: sampleOutcomes2,
      pricingModel: 'LMSR',
      b: 1000,
    });

    const book: OrderbookSnapshot = {
      marketId: 'm1',
      outcomeIndex: 0,
      timestampMs: Date.now(),
      bids: [],
      asks: [
        { price: 0.30, size: 20 },
        { price: 0.35, size: 30 },
        { price: 0.70, size: 100 },
      ],
    };

    const route = HybridOrderRouter.routeOrder(
      {
        orderId: 'ord-buy-1',
        marketId: 'm1',
        outcomeIndex: 0,
        side: 'BUY',
        size: 100,
      },
      pool,
      book
    );

    expect(route.legs.length).toBeGreaterThanOrEqual(2);
    expect(route.legs.some((l) => l.venue === 'CLOB')).toBe(true);
    expect(route.legs.some((l) => l.venue === 'AMM')).toBe(true);
    expect(route.filledSize).toBeGreaterThan(0);
    expect(route.vwap).toBeGreaterThan(0);
  });

  it('routes SELL order across CLOB bids and AMM pool', () => {
    const pool = new MultiTokenPool({
      poolId: 'pool-router-2',
      outcomes: sampleOutcomes2,
      pricingModel: 'LMSR',
      b: 1000,
    });

    const book: OrderbookSnapshot = {
      marketId: 'm1',
      outcomeIndex: 0,
      timestampMs: Date.now(),
      bids: [
        { price: 0.65, size: 25 },
        { price: 0.60, size: 25 },
        { price: 0.20, size: 100 },
      ],
      asks: [],
    };

    const route = HybridOrderRouter.routeOrder(
      {
        orderId: 'ord-sell-1',
        marketId: 'm1',
        outcomeIndex: 0,
        side: 'SELL',
        size: 80,
      },
      pool,
      book
    );

    expect(route.legs.length).toBeGreaterThanOrEqual(2);
    expect(route.legs.some((l) => l.venue === 'CLOB')).toBe(true);
    expect(route.legs.some((l) => l.venue === 'AMM')).toBe(true);
    expect(route.filledSize).toBe(80);
    expect(route.vwap).toBeGreaterThan(0);
  });

  it('routes order directly to AMM when orderbook is undefined or empty', () => {
    const pool = new MultiTokenPool({
      poolId: 'pool-router-3',
      outcomes: sampleOutcomes2,
      b: 1000,
    });

    const routeBuy = HybridOrderRouter.routeOrder(
      {
        orderId: 'ord-3',
        marketId: 'm1',
        outcomeIndex: 0,
        side: 'BUY',
        size: 50,
      },
      pool
    );
    expect(routeBuy.legs).toHaveLength(1);
    expect(routeBuy.legs[0].venue === 'AMM').toBe(true);
  });
});

describe('AmmEngine Deep Branch Coverage', () => {
  it('initializes, registers pools, retrieves pool, and handles lifecycle', () => {
    const engine = new AmmEngine('audit-secret-123');
    expect(engine.isActive()).toBe(true);
    expect(engine.getAuditLogger()).toBeDefined();
    expect(engine.getMetrics()).toBeDefined();
    expect(engine.getAdverseGuard()).toBeDefined();

    const pool = engine.registerPool({
      poolId: 'engine-pool-1',
      outcomes: sampleOutcomes2,
      pricingModel: 'LMSR',
      b: 1000,
    });
    expect(pool).toBeDefined();
    expect(engine.getPool('engine-pool-1')).toBe(pool);
    expect(engine.getPool('nonexistent')).toBeUndefined();

    engine.shutdown();
    expect(engine.isActive()).toBe(false);
  });

  it('executes trades passing risk gate, and rejects trades failing risk gate', () => {
    const engine = new AmmEngine();
    engine.registerPool({
      poolId: 'engine-pool-trade',
      outcomes: sampleOutcomes2,
      b: 1000,
    });

    const riskContextPass: RiskContext = {
      currentDailyDrawdown: 0.02,
      currentPoolExposureUsd: 100,
      venueLatencyMs: 15,
      portfolioEquityUsd: 100000,
    };

    const tradeResPass = engine.executeTrade(
      {
        poolId: 'engine-pool-trade',
        outcomeIndex: 0,
        action: 'BUY',
        amount: 100,
      },
      riskContextPass
    );
    expect(tradeResPass.success).toBe(true);
    expect(tradeResPass.result).toBeDefined();

    // Rejected by risk gate (latency spike > 500ms)
    const riskContextReject: RiskContext = {
      ...riskContextPass,
      venueLatencyMs: 999,
    };

    const tradeResReject = engine.executeTrade(
      {
        poolId: 'engine-pool-trade',
        outcomeIndex: 0,
        action: 'BUY',
        amount: 100,
      },
      riskContextReject
    );
    expect(tradeResReject.success).toBe(false);
    expect(tradeResReject.rejection).toBeDefined();

    expect(() =>
      engine.executeTrade(
        {
          poolId: 'missing-pool',
          outcomeIndex: 0,
          action: 'BUY',
          amount: 100,
        },
        riskContextPass
      )
    ).toThrow('Pool missing-pool not found');
  });
});

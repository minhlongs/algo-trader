/**
 * Unit tests for `BacktestOrderManager` per-token `FeeScheduleResolver` wiring.
 *
 * Acceptance criterion #3: every fill path that can reach a ledger obtains its
 * schedule from a market/token (`FeeScheduleResolver`), never from a keyword.
 */

import { describe, expect, it, vi } from 'vitest';
import { BacktestOrderManager } from '../../../src/desk/backtesting/backtest-order-manager';
import type { FeeScheduleResolver } from '../../../src/desk/polymarket/fee-schedule-resolver';
import type { PolymarketFeeSchedule } from '../../../src/desk/polymarket/polymarket-fee-calculator';

const CRYPTO_SCHEDULE: PolymarketFeeSchedule = {
  exponent: 1,
  rate: 0.07,
  takerOnly: true,
  rebateRate: 0.2,
};

const POLITICS_RATE_SCHEDULE: PolymarketFeeSchedule = {
  exponent: 1,
  rate: 0.04,
  takerOnly: true,
  rebateRate: 0.25,
};

describe('BacktestOrderManager + FeeScheduleResolver', () => {
  it('resolves the parabolic schedule by tokenId on closing fills and deducts exact venue fee + gas', async () => {
    const schedules = new Map<string, PolymarketFeeSchedule | null>([
      ['token-crypto', CRYPTO_SCHEDULE],
      ['token-exempt', null],
      ['token-four-pct', POLITICS_RATE_SCHEDULE],
    ]);
    const resolveSpy = vi.fn(async (tokenId: string) => schedules.get(tokenId) ?? null);
    const feeResolver: FeeScheduleResolver = { resolve: resolveSpy };

    const manager = new BacktestOrderManager(1000, { feeResolver });

    // 100 shares bought at 0.40, sold at 0.50 -> gross = +$10.00.
    // Crypto schedule (rate 0.07):
    //   entry fee/sh = 0.07 * 0.40 * 0.60 = 0.0168 -> $1.68
    //   exit  fee/sh = 0.07 * 0.50 * 0.50 = 0.0175 -> $1.75
    //   total fee = $3.43, gas (2 fills * $0.05) = $0.10 -> net = $6.47.
    await manager.placeOrder({
      tokenId: 'token-crypto',
      side: 'buy',
      price: 0.4,
      size: 100,
      timestamp: '2026-11-13T00:00:00.000Z',
    });
    await manager.placeOrder({
      tokenId: 'token-crypto',
      side: 'sell',
      price: 0.5,
      size: 100,
      timestamp: '2026-11-13T01:00:00.000Z',
    });

    expect(resolveSpy).toHaveBeenCalledWith('token-crypto');
    const costs = manager.getFillCosts();
    expect(costs).toHaveLength(1);
    expect(costs[0]).toEqual({
      grossPnlUsd: 10,
      feeUsd: 3.43,
      gasUsd: 0.1,
      netPnlUsd: 6.47,
    });
    expect(manager.getCurrentEquity()).toBe(1006.47);
  });

  it('charges zero trading fee (gas only) when FeeScheduleResolver returns null for an exempt token', async () => {
    const feeResolver: FeeScheduleResolver = {
      resolve: vi.fn(async () => null),
    };
    const manager = new BacktestOrderManager(1000, { feeResolver });

    await manager.placeOrder({
      tokenId: 'token-geopolitics-exempt',
      side: 'buy',
      price: 0.45,
      size: 100,
      timestamp: '2026-11-13T00:00:00.000Z',
    });
    await manager.placeOrder({
      tokenId: 'token-geopolitics-exempt',
      side: 'sell',
      price: 0.55,
      size: 100,
      timestamp: '2026-11-13T01:00:00.000Z',
    });

    const [cost] = manager.getFillCosts();
    expect(cost).toEqual({
      grossPnlUsd: 10,
      feeUsd: 0,
      gasUsd: 0.1,
      netPnlUsd: 9.9,
    });
    expect(manager.getCurrentEquity()).toBe(1009.9);
  });

  it('propagates transport errors when FeeScheduleResolver rejects instead of silently assuming zero fee', async () => {
    const feeResolver: FeeScheduleResolver = {
      resolve: vi.fn(async () => {
        throw new Error('Gamma upstream 503');
      }),
    };
    const manager = new BacktestOrderManager(1000, { feeResolver });

    await expect(
      manager.placeOrder({
        tokenId: 'token-unreachable',
        side: 'buy',
        price: 0.5,
        size: 10,
      }),
    ).rejects.toThrow('Gamma upstream 503');
    expect(manager.getTrades()).toHaveLength(0);
  });

  it('credits maker rebate on GTC legs instead of charging taker fee and marks unrealized MTM equity', async () => {
    const feeResolver: FeeScheduleResolver = {
      resolve: vi.fn(async () => POLITICS_RATE_SCHEDULE),
    };
    const manager = new BacktestOrderManager(1000, { feeResolver });

    // Maker GTC buy at 0.40 (100 shares): rebate/sh = 0.25 * (0.04 * 0.40 * 0.60) = 0.0024 -> -$0.24 fee
    // Taker IOC sell at 0.50 (100 shares): fee/sh = 0.04 * 0.50 * 0.50 = 0.01 -> +$1.00 fee
    // Net venue fee = $0.76, gas = $0.10, gross = $10.00 -> net = $9.14.
    await manager.placeOrder({
      tokenId: 'token-four-pct',
      side: 'buy',
      price: '0.40',
      size: '100',
      orderType: 'GTC',
      timestamp: '2026-11-13T00:00:00.000Z',
    });

    manager.updatePrices(new Map([['token-four-pct', 0.46]]));
    expect(manager.getCurrentEquity()).toBeCloseTo(1006, 6);

    await manager.placeOrder({
      tokenId: 'token-four-pct',
      side: 'sell',
      price: '0.50',
      size: '100',
      orderType: 'IOC',
      timestamp: '2026-11-13T01:00:00.000Z',
    });

    const [cost] = manager.getFillCosts();
    expect(cost.feeUsd).toBeCloseTo(0.76, 6);
    expect(cost.netPnlUsd).toBeCloseTo(9.14, 6);
    expect(manager.getCurrentEquity()).toBeCloseTo(1009.14, 6);
    const closingTrade = manager.getTrades()[1]!;
    expect(closingTrade.venueCostUsd).toBeCloseTo(0.86, 6);
  });
});

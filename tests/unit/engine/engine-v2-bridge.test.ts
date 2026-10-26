import { describe, it, expect, vi } from 'vitest';
import { StrategyRunner, DeskStrategyRunner } from '../../../src/engine/strategy-runner';
import { TradeExecutor } from '../../../src/engine/trade-executor';
import { LiveExecutionGuard } from '../../../src/desk/execution/live-execution-guard';
import type { PolymarketOrder } from '../../../src/desk/execution/polymarket-signer';

function makeOrder(overrides: Partial<PolymarketOrder> = {}): PolymarketOrder {
  return {
    tokenId: '0xabc123',
    price: 0.5,
    size: 10,
    side: 'BUY',
    expiration: Math.floor(Date.now() / 1000) + 3600,
    nonce: '1',
    feeRateBps: 0,
    signatureType: 0,
    ...overrides,
  };
}

describe('Engine V2 Bridge (StrategyRunner & TradeExecutor)', () => {
  it('re-exports DeskStrategyRunner from V2 desk', () => {
    expect(DeskStrategyRunner).toBeDefined();
  });

  it('registers, starts, tracks status, and stops strategies cleanly', async () => {
    const runner = new StrategyRunner();
    const startSpy = vi.fn().mockResolvedValue(undefined);
    const stopSpy = vi.fn().mockResolvedValue(undefined);

    runner.register('market-maker', { start: startSpy, stop: stopSpy });
    expect(runner.getStrategy('market-maker')).toBeDefined();
    expect(runner.getAllStatus()).toEqual([{ name: 'market-maker', status: 'registered' }]);

    await runner.startAll([{ name: 'market-maker', enabled: true, capitalAllocation: '500', params: {} }]);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(runner.getAllStatus()).toEqual([{ name: 'market-maker', status: 'running' }]);

    await runner.stopAll();
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(runner.getAllStatus()).toEqual([{ name: 'market-maker', status: 'stopped' }]);
  });

  it('executes paper orders when no live adapter is provided and enforces guard when attached', async () => {
    const guard = new LiveExecutionGuard({ capitalUsdc: 1000, maxPositionFraction: 0.05 });
    guard.setEnabled(true);

    const executor = new TradeExecutor({ guard });
    expect(executor.isLive()).toBe(false);

    const res = await executor.executeOrder(makeOrder({ size: 20, price: 0.5 }));
    expect(res.orderID).toMatch(/^paper-exec-/);
    expect(res.status).toBe('matched');
    expect(executor.getExecutedCount()).toBe(1);

    await expect(
      executor.executeOrder(makeOrder({ size: 500, price: 0.5 })),
    ).rejects.toThrow(/TradeExecutor guard rejected order/);
  });

  it('delegates order placement to live PolymarketAdapter when provided', async () => {
    const placeOrder = vi.fn().mockResolvedValue({ orderID: 'clob-999', status: 'live' });
    const guard = new LiveExecutionGuard({ capitalUsdc: 1000, maxPositionFraction: 0.05 });
    const executor = new TradeExecutor({
      polymarket: { placeOrder } as never,
      guard,
    });
    expect(executor.isLive()).toBe(true);
    expect(guard.getStatus().enabled).toBe(true);

    const order = makeOrder();
    const res = await executor.executeOrder(order);
    expect(placeOrder).toHaveBeenCalledWith(order);
    expect(res.orderID).toBe('clob-999');
  });

  it('skips disabled strategies and handles start/stop errors in StrategyRunner', async () => {
    const runner = new StrategyRunner();
    const stopOk = vi.fn();
    const stopErr = vi.fn().mockRejectedValue(new Error('stop failed'));
    const startErr = vi.fn().mockRejectedValue(new Error('start failed'));

    runner.register('no-start-hook', { stop: stopOk });
    runner.register('disabled-strat', { start: vi.fn(), stop: stopErr });

    await runner.startAll([
      { name: 'no-start-hook', enabled: true, capitalAllocation: '100', params: {} },
      { name: 'disabled-strat', enabled: false, capitalAllocation: '100', params: {} },
    ]);
    expect(runner.getAllStatus()).toEqual([
      { name: 'no-start-hook', status: 'running' },
      { name: 'disabled-strat', status: 'registered' },
    ]);

    await runner.stopAll();
    expect(runner.getAllStatus()).toEqual([
      { name: 'no-start-hook', status: 'stopped' },
      { name: 'disabled-strat', status: 'error' },
    ]);

    runner.register('fail-start', { start: startErr, stop: stopOk });
    await expect(runner.startAll()).rejects.toThrow('start failed');
    expect(runner.getAllStatus().find((s) => s.name === 'fail-start')?.status).toBe('error');
  });
});

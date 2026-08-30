import { describe, it, expect, vi } from 'vitest';
import { HelloWorldStrategy } from '../01-hello-world-strategy';

describe('examples::01-hello-world-strategy', () => {
  it('loads HelloWorldStrategy', () => {
    expect(typeof HelloWorldStrategy).toBe('function');
  });

  it('getName returns the strategy name constant', () => {
    const strat = new HelloWorldStrategy();
    expect(strat.getName()).toBe('HelloWorld');
  });

  it('initialize logs a startup message', async () => {
    const strat = new HelloWorldStrategy();
    await expect(strat.initialize()).resolves.toBeUndefined();
  });

  it('execute appends candles to a capped price history and returns a wait signal', async () => {
    const strat = new HelloWorldStrategy();
    const candles = Array.from({ length: 5 }, (_, i) => ({ open: 100 + i, close: 101 + i } as any));

    const signal = await strat.execute(candles);

    expect(signal.action).toBe('wait');
    expect(signal.confidence).toBe(0);
    expect(signal.reason).toContain('not yet implemented');
  });

  it('execute keeps only the last 100 candles (sliding window)', async () => {
    const strat = new HelloWorldStrategy();
    const big = Array.from({ length: 150 }, (_, i) => ({ open: i, close: i + 1 } as any));

    await strat.execute(big);
    await strat.execute([{ open: 999, close: 1000 } as any]);

    const status = (strat as any).getStatus?.();
    expect(status).toBeDefined();
    expect(status.candlesProcessed).toBe(100); // window capped at 100, never grows past it
  });

  it('buySignal clamps confidence into [0, 1]', () => {
    const strat = new HelloWorldStrategy() as any;
    const below = strat.buySignal(-5, 'too low');
    const above = strat.buySignal(99, 'too high');
    const inRange = strat.buySignal(0.5, 'ok');

    expect(below.action).toBe('buy');
    expect(below.confidence).toBe(0);
    expect(above.confidence).toBe(1);
    expect(inRange.confidence).toBe(0.5);
  });

  it('sellSignal clamps confidence into [0, 1]', () => {
    const strat = new HelloWorldStrategy() as any;
    const below = strat.sellSignal(-2, 'too low');
    const above = strat.sellSignal(7, 'too high');

    expect(below.action).toBe('sell');
    expect(below.confidence).toBe(0);
    expect(above.confidence).toBe(1);
  });

  it('waitSignal always emits confidence 0', () => {
    const strat = new HelloWorldStrategy() as any;
    const signal = strat.waitSignal('stand by');

    expect(signal.action).toBe('wait');
    expect(signal.confidence).toBe(0);
    expect(signal.reason).toBe('stand by');
  });

  it('getStatus reports the running strategy state', () => {
    const strat = new HelloWorldStrategy();
    const status = (strat as any).getStatus?.();

    expect(status).toEqual({
      name: 'HelloWorld',
      candlesProcessed: 0,
      ready: true,
    });
  });

  it('dispose logs a shutdown message', () => {
    const strat = new HelloWorldStrategy();
    expect(() => strat.dispose?.()).not.toThrow();
  });
});
/**
 * Integration test: paper-trading-entry.ts
 *
 * Verifies:
 * - initPaperTrading() starts loop when PAPER_TRADING_ENABLED=true
 * - initPaperTrading() is a no-op when env var is not set or falsy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockInstances, MockCtor, makeMockInstance } = vi.hoisted(() => {
  const instances: Array<{
    start: ReturnType<typeof vi.fn>;
    setKV: ReturnType<typeof vi.fn>;
    loadState: ReturnType<typeof vi.fn>;
    runTick: ReturnType<typeof vi.fn>;
    getTrades: ReturnType<typeof vi.fn>;
  }> = [];
  const make = () => ({
    start: vi.fn(),
    setKV: vi.fn(),
    loadState: vi.fn(),
    runTick: vi.fn(),
    getTrades: vi.fn(() => []),
  });
  const Ctor = vi.fn(function () {
    const inst = make();
    instances.push(inst);
    return inst;
  }) as unknown as {
    mock: { calls: Array<[{ symbols: string[] }]> };
    new (...args: unknown[]): {
      start: ReturnType<typeof vi.fn>;
      setKV: ReturnType<typeof vi.fn>;
      loadState: ReturnType<typeof vi.fn>;
      runTick: ReturnType<typeof vi.fn>;
      getTrades: ReturnType<typeof vi.fn>;
    };
  };
  return { mockInstances: instances, MockCtor: Ctor, makeMockInstance: make };
});

vi.mock('@desk/paper-trading/paper-trading-loop', () => ({
  PaperTradingLoop: MockCtor,
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { initPaperTrading, runPaperTradingTick, __resetPaperTradingLoop } from '../paper-trading-entry';

describe('initPaperTrading', () => {
  const originalEnv = process.env.PAPER_TRADING_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances.length = 0;
    __resetPaperTradingLoop();
    delete process.env.PAPER_TRADING_ENABLED;
  });

  afterEach(() => {
    if (originalEnv !== undefined) process.env.PAPER_TRADING_ENABLED = originalEnv;
    else delete process.env.PAPER_TRADING_ENABLED;
  });

  it('starts loop when PAPER_TRADING_ENABLED=true', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    initPaperTrading();
    expect(MockCtor).toHaveBeenCalledTimes(1);
    expect(mockInstances.length).toBe(1);
    expect(mockInstances[0].start).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when env var is not set', () => {
    initPaperTrading();
    expect(MockCtor).not.toHaveBeenCalled();
    expect(mockInstances.length).toBe(0);
  });

  it('is a no-op when PAPER_TRADING_ENABLED=false', () => {
    process.env.PAPER_TRADING_ENABLED = 'false';
    initPaperTrading();
    expect(MockCtor).not.toHaveBeenCalled();
    expect(mockInstances.length).toBe(0);
  });

  it('passes env-configured symbols to constructor', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    process.env.PAPER_TRADING_SYMBOLS = 'SOL/USD,AVAX/USD';
    initPaperTrading();
    expect(MockCtor).toHaveBeenCalledTimes(1);
    expect(MockCtor.mock.calls[0][0].symbols).toEqual(['SOL/USD', 'AVAX/USD']);
    delete process.env.PAPER_TRADING_SYMBOLS;
  });

  it('falls back to default symbols when PAPER_TRADING_SYMBOLS not set', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    initPaperTrading();
    expect(MockCtor).toHaveBeenCalledTimes(1);
    expect(MockCtor.mock.calls[0][0].symbols).toEqual(['BTC/USD', 'ETH/USD']);
  });

  it('runPaperTradingTick is a no-op when loop not initialized', async () => {
    await runPaperTradingTick();
    expect(mockInstances.length).toBe(0);
  });

  it('runPaperTradingTick loads state, runs tick, and wires KV', async () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    initPaperTrading();
    const kv = { get: vi.fn(), put: vi.fn() };
    await runPaperTradingTick(kv as never);
    expect(mockInstances[0].setKV).toHaveBeenCalledWith(kv);
    expect(mockInstances[0].loadState).toHaveBeenCalledTimes(1);
    expect(mockInstances[0].runTick).toHaveBeenCalledTimes(1);
  });

  it('runPaperTradingTick initializes loop on first cron tick when not yet started', async () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    const kv = { get: vi.fn(), put: vi.fn() };
    await runPaperTradingTick(kv as never);
    expect(MockCtor).toHaveBeenCalledTimes(1);
    expect(mockInstances[0].setKV).toHaveBeenCalledWith(kv);
    expect(mockInstances[0].loadState).toHaveBeenCalledTimes(1);
    expect(mockInstances[0].runTick).toHaveBeenCalledTimes(1);
  });

  it('runPaperTradingTick is a no-op when paper trading disabled', async () => {
    delete process.env.PAPER_TRADING_ENABLED;
    await runPaperTradingTick();
    expect(MockCtor).not.toHaveBeenCalled();
    expect(mockInstances.length).toBe(0);
  });
});
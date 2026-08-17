/**
 * Integration test: paper-trading-entry.ts
 *
 * Verifies:
 * - initPaperTrading() starts loop when PAPER_TRADING_ENABLED=true
 * - initPaperTrading() is a no-op when env var is not set or falsy
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockInstances, MockCtor, makeMockInstance } = vi.hoisted(() => {
  const instances: Array<{ start: ReturnType<typeof vi.fn> }> = [];
  const make = () => ({ start: vi.fn() });
  const Ctor = vi.fn(function () {
    const inst = make();
    instances.push(inst);
    return inst;
  });
  return { mockInstances: instances, MockCtor: Ctor, makeMockInstance: make };
});

vi.mock('@desk/paper-trading/paper-trading-loop', () => ({
  PaperTradingLoop: MockCtor,
}));

vi.mock('@shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { initPaperTrading } from '../paper-trading-entry';

describe('initPaperTrading', () => {
  const originalEnv = process.env.PAPER_TRADING_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances.length = 0;
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
    const config = MockCtor.mock.calls[0][0];
    expect(config.symbols).toEqual(['SOL/USD', 'AVAX/USD']);
    delete process.env.PAPER_TRADING_SYMBOLS;
  });

  it('falls back to default symbols when PAPER_TRADING_SYMBOLS not set', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    initPaperTrading();
    const config = MockCtor.mock.calls[0][0];
    expect(config.symbols).toEqual(['BTC/USD', 'ETH/USD']);
  });
});
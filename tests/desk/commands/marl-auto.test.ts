import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMarlAuto } from '../../../src/desk/commands/marl-auto';
import { MarlEngine } from '../../../src/desk/marl/engine/marl-engine';

describe('marl-auto CLI command runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes and runs marl:auto with default options', async () => {
    const result = await runMarlAuto({ verbose: false });

    expect(result).toBeDefined();
    expect(result.engine).toBeInstanceOf(MarlEngine);
    expect(result.quotesGenerated).toBe(1);
    expect(result.status.symbol).toBe('BTC/USDT');
    expect(result.status.isRunning).toBe(true);
    expect(result.status.portfolioCapital).toBe(100_000);

    result.engine.stop();
    expect(result.engine.getStatus().isRunning).toBe(false);
  });

  it('accepts custom symbol, capital, risk aversion, and quote parameters', async () => {
    const result = await runMarlAuto({
      symbol: 'ETH/USDT',
      capital: 50_000,
      gamma: 0.2,
      sigma: 0.4,
      quoteSize: 5,
      dryRun: true,
      verbose: false,
    });

    expect(result.status.symbol).toBe('ETH/USDT');
    expect(result.status.portfolioCapital).toBe(50_000);
    expect(result.quotesGenerated).toBe(1);

    result.engine.stop();
  });

  it('runs timed execution loop when durationSeconds is positive', async () => {
    vi.useFakeTimers();
    const runPromise = runMarlAuto({
      symbol: 'SOL/USDT',
      durationSeconds: 2,
      verbose: false,
    });

    await vi.advanceTimersByTimeAsync(2000);
    const result = await runPromise;

    expect(result.status.symbol).toBe('SOL/USDT');
    expect(result.engine.getStatus().isRunning).toBe(false);
    vi.useRealTimers();
  });
});

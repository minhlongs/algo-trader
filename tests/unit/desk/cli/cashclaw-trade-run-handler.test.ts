import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleTradeRun } from '../../../../src/desk/cli/cashclaw-trade-run-handler';
import { logger } from '../../../../src/shared/utils/logger';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/desk/polymarket/strategy-registry', () => ({
  getStrategy: vi.fn((name: string) => {
    if (name === 'spread-mean-reversion') {
      return { name, ctor: class {}, defaultConfig: {} };
    }
    return undefined;
  }),
  listStrategies: vi.fn().mockReturnValue([
    { name: 'spread-mean-reversion', description: 'Spread strategy' },
  ]),
}));

describe('cashclaw-trade-run-handler', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('rejects invalid capital with error and exits with code 1', async () => {
    await expect(
      handleTradeRun({
        strategy: 'spread-mean-reversion',
        mode: 'paper',
        capital: '-100',
        ticks: '5',
        interval: '1000',
        yes: true,
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(logger.error).toHaveBeenCalledWith('Error: --capital must be a positive number');
  });

  it('rejects unknown strategy with error and exits with code 1', async () => {
    await expect(
      handleTradeRun({
        strategy: 'unknown-strat',
        mode: 'paper',
        capital: '1000',
        ticks: '5',
        interval: '1000',
        yes: true,
      }),
    ).rejects.toThrow('process.exit(1)');

    expect(logger.error).toHaveBeenCalledWith('Unknown strategies: unknown-strat');
  });
});

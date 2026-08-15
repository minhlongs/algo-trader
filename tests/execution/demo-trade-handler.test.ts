/**
 * Demo Trade Handler — integration + regression tests.
 *
 * Validates handleDemoTrade end-to-end behavior with mocked strategy-registry
 * and paper-executor so no real markets or file I/O involved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionResult, PaperAccount } from '../../src/desk/execution/paper-position-tracker';
import { logger } from '../../src/shared/utils/logger';

// Mock logger to prevent console output during tests
vi.mock('../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock variables (vi.hoisted runs before vi.mock is hoisted, avoiding TDZ) ───
const { mockResetPaperExecutor, mockPaperExecutor, mockGetPaperExecutor } = vi.hoisted(() => {
  const executor = {
    start: vi.fn().mockResolvedValue(
      { id: 'acct-1', balance: 1000, equity: 1000, realizedPnl: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0, maxEquity: 1000, startTime: Date.now() } as PaperAccount,
    ),
    executePaperTrade: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockResetPaperExecutor: vi.fn(),
    mockPaperExecutor: executor,
    mockGetPaperExecutor: vi.fn(() => executor),
  };
});

// ── Module mocks ────────────────────────────────────────────────────────────────

vi.mock('../../src/desk/polymarket/strategy-registry', () => {
  const entry = {
    name: 'test-strategy',
    description: 'Strategy',
    ctor: class {},
    defaultConfig: { positionSize: 10 },
  };
  return { getStrategy: vi.fn((name: string) => (name === 'known' ? entry : undefined)) };
});

vi.mock('../../src/desk/execution/paper-executor', () => ({
  resetPaperExecutor: mockResetPaperExecutor,
  getPaperExecutor: mockGetPaperExecutor,
}));

import { handleDemoTrade } from '../../src/desk/cli/demo-trade-handler';

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeAccount = (overrides: Partial<PaperAccount> = {}): PaperAccount => ({
  id: 'acct-1',
  balance: 1000,
  equity: 1000,
  realizedPnl: 0,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  maxEquity: 1000,
  startTime: Date.now(),
  ...overrides,
});

const successResult = (acct: PaperAccount): ExecutionResult => ({
  success: true,
  trade: {
    id: 'trade-1',
    symbol: 'demo:test-strategy',
    side: 'buy' as const,
    quantity: 8,
    requestedPrice: 0.5,
    executedPrice: 0.5004,
    slippage: 0.0004,
    fee: 0.004,
    status: 'filled' as const,
    timestamp: Date.now(),
  },
  account: acct,
  message: 'Filled',
});

const failureResult = (msg: string): ExecutionResult => ({
  success: false,
  message: msg,
  account: makeAccount(),
});

function makeCliOpts(overrides: { strategy?: string; capital?: string; yes?: boolean } = {}): { strategy: string; capital: string; yes: boolean } {
  return {
    strategy: 'known',
    capital: '1000',
    yes: true,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleDemoTrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logger.info).mockClear();
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  describe('validation', () => {
    it('exits with code 1 on non-positive capital', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as never);
      await expect(
        handleDemoTrade(makeCliOpts({ capital: '-10' })),
      ).rejects.toThrow('exit');
      expect(logger.error).toHaveBeenCalledWith(
        'Error: --capital must be a positive number',
      );
      mockExit.mockRestore();
    });

    it('exits with code 1 on NaN capital', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as never);
      await expect(
        handleDemoTrade(makeCliOpts({ capital: 'abc' })),
      ).rejects.toThrow('exit');
      expect(logger.error).toHaveBeenCalledWith(
        'Error: --capital must be a positive number',
      );
      mockExit.mockRestore();
    });

    it('exits with code 1 on unknown strategy', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as never);
      await expect(
        handleDemoTrade(makeCliOpts({ strategy: 'ghost' })),
      ).rejects.toThrow('exit');
      expect(logger.error).toHaveBeenCalledWith('Unknown strategy: ghost');
      mockExit.mockRestore();
    });
  });

  describe('happy path — successful trade', () => {
    it('resets executor, calls start, executePaperTrade, stop, then resets again', async () => {
      const acct = makeAccount();
      mockPaperExecutor.start.mockResolvedValue(acct);
      mockPaperExecutor.executePaperTrade.mockResolvedValue(successResult(acct));

      // Suppress console output during test
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await handleDemoTrade(makeCliOpts({ capital: '1000' }));

      expect(mockResetPaperExecutor).toHaveBeenCalledTimes(2);
      expect(mockGetPaperExecutor).toHaveBeenCalledOnce();

      const startArg = mockPaperExecutor.start.mock.calls[0]?.[0];
      expect(startArg).toBe(1000);

      expect(mockPaperExecutor.executePaperTrade).toHaveBeenCalledTimes(1);
      const call = mockPaperExecutor.executePaperTrade.mock.calls[0];
      expect(call[0]).toMatchObject({
        symbol: 'demo:test-strategy',
        side: 'buy',
        quantity: 10, // defaultConfig.positionSize from mock registry
      });
      expect(call[1]).toBe(0.5); // mid-market price
      expect(mockPaperExecutor.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('filled trade — summary printed', () => {
    it('prints trade ID, price, fee, and account summary', async () => {
      const acct = makeAccount({ balance: 992, totalTrades: 1 });
      mockPaperExecutor.start.mockResolvedValue(acct);
      mockPaperExecutor.executePaperTrade.mockResolvedValue(successResult(acct));

      await handleDemoTrade(makeCliOpts({ capital: '1000' }));

      // Check logger.info was called with relevant output
      const logCalls = vi.mocked(logger.info).mock.calls.map(c => String(c[0]));
      const joined = logCalls.join('\n');
      // detector uses literal strings from printResult()
      expect(joined).toContain('Trade ID');
      expect(joined).toContain('Executed');
      expect(joined).toContain('Fee');
      expect(joined).toContain('Account Summary');
      expect(joined).toContain('Balance');
      expect(joined).toContain('Realized P&L');
      expect(joined).toContain('Win/Loss');

      // account fields forwarded to output
      const balLine = logCalls.find((l) => l.includes('Balance'));
      expect(balLine).toBeDefined();
      expect(balLine).toContain('992.00');
    });
  });

  describe('unfilled trade — no crash, prints result message', () => {
    it('prints rejection message and balance without trade details', async () => {
      const acct = makeAccount({ balance: 1000, totalTrades: 0 });
      mockPaperExecutor.start.mockResolvedValue(acct);
      mockPaperExecutor.executePaperTrade.mockResolvedValue(
        failureResult('not filled: market closed'),
      );

      await handleDemoTrade(makeCliOpts({ capital: '1000' }));

      // Check logger.info was called with relevant output
      const logCalls = vi.mocked(logger.info).mock.calls.map(c => String(c[0]));
      const joined = logCalls.join('\n');
      expect(joined).toContain('not filled: market closed');
      expect(joined).toContain('Balance');
      expect(joined).not.toContain('Trade ID');
      expect(joined).not.toContain('Side');
    });
  });

  describe('execution contract', () => {
    it('runs start before executePaperTrade', async () => {
      const order: string[] = [];
      mockPaperExecutor.start.mockImplementation(async () => {
        order.push('start');
        return makeAccount();
      });
      mockPaperExecutor.executePaperTrade.mockImplementation(async () => {
        order.push('execute');
        return successResult(makeAccount());
      });

      await handleDemoTrade(makeCliOpts({ capital: '1000' }));
      expect(order).toEqual(['start', 'execute']);
    });

    it('runs stop after executePaperTrade regardless of result', async () => {
      // filled
      mockPaperExecutor.start.mockResolvedValue(makeAccount());
      mockPaperExecutor.executePaperTrade.mockResolvedValue(successResult(makeAccount()));

    await handleDemoTrade(makeCliOpts({ capital: '1000' }));
      expect(mockPaperExecutor.stop).toHaveBeenCalled();

      // rejected — need fresh mocks for second scenario
      mockPaperExecutor.stop.mockClear();
      mockPaperExecutor.start.mockResolvedValue(makeAccount());
      mockPaperExecutor.executePaperTrade.mockResolvedValue(failureResult('rejected'));

      await handleDemoTrade(makeCliOpts({ capital: '1000' }));
    });
  });

  describe('size derivation', () => {
    it('falls back to 8 USDC when strategy has no positionSize', async () => {
      // mock registry to return entry with missing positionSize
      const entry = {
        name: 'no-size-strategy',
        description: 'S',
        ctor: class {},
        defaultConfig: {}, // no positionSize
      };
      const strategyRegistry = await import('../../src/desk/polymarket/strategy-registry');
      vi.mocked(strategyRegistry.getStrategy).mockReturnValue(entry);

      mockPaperExecutor.start.mockResolvedValue(makeAccount());
      mockPaperExecutor.executePaperTrade.mockResolvedValue(successResult(makeAccount()));

      await handleDemoTrade(makeCliOpts({ strategy: 'no-size-strategy' }));

      const [signal] = mockPaperExecutor.executePaperTrade.mock.calls[0];
      expect(signal.quantity).toBe(8);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerTradeCommands } from '../../../../src/desk/cli/cashclaw-trade-commands';
import { logger } from '../../../../src/shared/utils/logger';
import * as startHandler from '../../../../src/desk/cli/cashclaw-trade-start-handler';
import * as runHandler from '../../../../src/desk/cli/cashclaw-trade-run-handler';
import * as demoHandler from '../../../../src/desk/cli/demo-trade-handler';
import * as journalHandler from '../../../../src/desk/cli/cashclaw-trade-journal-handler';
import * as backtestHandler from '../../../../src/desk/cli/cashclaw-trade-backtest-handler';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/desk/cli/cashclaw-trade-start-handler', () => ({
  handleTradeStart: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/desk/cli/cashclaw-trade-run-handler', () => ({
  handleTradeRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/desk/cli/demo-trade-handler', () => ({
  handleDemoTrade: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/desk/cli/cashclaw-trade-journal-handler', () => ({
  handleTradeJournal: vi.fn(),
}));

vi.mock('../../../../src/desk/cli/cashclaw-trade-backtest-handler', () => ({
  handleTradeBacktest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/desk/polymarket/strategy-registry', () => ({
  listStrategies: vi.fn().mockReturnValue([
    { name: 'strat-1', description: 'Desc 1' },
    { name: 'strat-2', description: 'Desc 2' },
  ]),
}));

describe('cashclaw-trade-commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupTradeCmd(): { program: Command; tradeCmd: Command } {
    const program = new Command('cashclaw');
    const tradeCmd = program.command('trade');
    registerTradeCommands(tradeCmd);
    return { program, tradeCmd };
  }

  it('registers all 7 trade subcommands with proper options', () => {
    const { tradeCmd } = setupTradeCmd();
    const commandNames = tradeCmd.commands.map((cmd) => cmd.name());
    expect(commandNames).toEqual([
      'start',
      'status',
      'list-strategies',
      'run',
      'demo',
      'journal',
      'backtest',
    ]);
  });

  it('dispatches trade start command', async () => {
    const { program } = setupTradeCmd();
    await program.parseAsync(['node', 'test', 'trade', 'start', '--mode', 'live', '--capital', '2500', '--strategy', 'strat-1', '--yes']);
    expect(startHandler.handleTradeStart).toHaveBeenCalledWith({
      mode: 'live',
      capital: '2500',
      strategy: 'strat-1',
      yes: true,
    });
  });

  it('dispatches trade status in JSON format', async () => {
    const { program } = setupTradeCmd();
    await program.parseAsync(['node', 'test', 'trade', 'status', '--json']);
    const call = vi.mocked(logger.info).mock.calls[0][0];
    const parsed = JSON.parse(String(call));
    expect(parsed.mode).toBe('live');
    expect(parsed.paperMode).toBeDefined();
  });

  it('dispatches trade status in human readable format with paper mode', async () => {
    const { program } = setupTradeCmd();
    const origEnv = { ...process.env };
    process.env['PAPER_MODE'] = 'true';
    process.env['POLYMARKET_API_KEY'] = 'test-key';
    process.env['POLY_PASSPHRASE'] = 'test-pass';
    delete process.env['POLYMARKET_API_SECRET'];
    delete process.env['POLY_API_SECRET'];
    delete process.env['POLYMARKET_PRIVATE_KEY'];
    delete process.env['POLY_PRIVATE_KEY'];
    try {
      await program.parseAsync(['node', 'test', 'trade', 'status']);
      const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes('CashClaw Live Trading Status'))).toBe(true);
      expect(calls.some((c) => c.includes('PAPER_MODE: PAPER'))).toBe(true);
      expect(calls.some((c) => c.includes('API Key: ✓ set'))).toBe(true);
      expect(calls.some((c) => c.includes('Passphrase: ✓ set'))).toBe(true);
      expect(calls.some((c) => c.includes('API Secret: ✗ missing'))).toBe(true);
    } finally {
      process.env = origEnv;
    }
  });

  it('dispatches trade status in human readable format with live mode', async () => {
    const { program } = setupTradeCmd();
    const origEnv = { ...process.env };
    process.env['PAPER_MODE'] = 'false';
    try {
      await program.parseAsync(['node', 'test', 'trade', 'status']);
      const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
      expect(calls.some((c) => c.includes('PAPER_MODE: LIVE'))).toBe(true);
    } finally {
      process.env = origEnv;
    }
  });

  it('dispatches trade list-strategies command', async () => {
    const { program } = setupTradeCmd();
    await program.parseAsync(['node', 'test', 'trade', 'list-strategies']);
    const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('2 strategies registered.'))).toBe(true);
    expect(calls.some((c) => c.includes('strat-1'))).toBe(true);
  });

  it('dispatches trade run command', async () => {
    const { program } = setupTradeCmd();
    await program.parseAsync(['node', 'test', 'trade', 'run', '--strategy', 'strat-1', '--ticks', '5']);
    expect(runHandler.handleTradeRun).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'strat-1', ticks: '5' }),
    );
  });

  it('dispatches trade demo command', async () => {
    const { program } = setupTradeCmd();
    await program.parseAsync(['node', 'test', 'trade', 'demo', '--capital', '500']);
    expect(demoHandler.handleDemoTrade).toHaveBeenCalledWith(
      expect.objectContaining({ capital: '500' }),
    );
  });

  it('dispatches trade journal command', async () => {
    const { program } = setupTradeCmd();
    await program.parseAsync(['node', 'test', 'trade', 'journal', '--type', 'fills', '--limit', '10']);
    expect(journalHandler.handleTradeJournal).toHaveBeenCalledWith({
      type: 'fills',
      limit: '10',
    });
  });

  it('dispatches trade backtest command', async () => {
    const { program } = setupTradeCmd();
    await program.parseAsync(['node', 'test', 'trade', 'backtest', '--days', '60']);
    expect(backtestHandler.handleTradeBacktest).toHaveBeenCalledWith(
      expect.objectContaining({ days: '60' }),
    );
  });
});

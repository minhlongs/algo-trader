import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerPaperAndBacktestCommands } from '../../../../src/desk/cli/cashclaw-cli-paper';
import { logger } from '../../../../src/shared/utils/logger';
import * as store from '../../../../src/shared/persistence/persistent-store';
import * as orch from '../../../../src/desk/wiring/paper-trading-orchestrator';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/desk/wiring/paper-trading-orchestrator', () => ({
  startPaperTrading: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/shared/persistence/persistent-store', () => ({
  readJson: vi.fn(),
}));

describe('cashclaw-cli-paper', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('registers paper, status, and backtest commands on program', () => {
    const program = new Command();
    registerPaperAndBacktestCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('paper');
    expect(names).toContain('status');
    expect(names).toContain('backtest');
  });

  it('runs paper trading command with valid options', async () => {
    const program = new Command();
    registerPaperAndBacktestCommands(program);
    await program.parseAsync(['node', 'test', 'paper', '--capital', '500', '--interval', '10000', '--max-positions', '5']);
    expect(orch.startPaperTrading).toHaveBeenCalledWith({
      capitalUsdc: 500,
      intervalMs: 10000,
      maxPositions: 5,
    });
  });

  it('validates invalid capital or interval in paper command', async () => {
    const program = new Command();
    registerPaperAndBacktestCommands(program);
    await program.parseAsync(['node', 'test', 'paper', '--capital', '-10']);
    expect(logger.error).toHaveBeenCalledWith('Error: --capital must be a positive number');
    expect(exitSpy).toHaveBeenCalledWith(1);

    vi.clearAllMocks();
    await program.parseAsync(['node', 'test', 'paper', '--interval', '2000']);
    expect(logger.error).toHaveBeenCalledWith('Error: --interval must be >= 5000ms');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('status prints empty message when no portfolio file exists', async () => {
    vi.mocked(store.readJson).mockReturnValue(null);
    const program = new Command();
    registerPaperAndBacktestCommands(program);
    await program.parseAsync(['node', 'test', 'status']);
    expect(logger.info).toHaveBeenCalledWith('No trades yet. Run: cashclaw paper');
  });

  it('status displays formatted summary when portfolio exists with trades', async () => {
    vi.mocked(store.readJson).mockReturnValue({
      capital: 1050.25,
      totalPnl: -45.5,
      positions: [{ id: 'pos-1' }],
      closedTrades: [{ id: 't-1' }, { id: 't-2' }],
      winCount: 1,
      lossCount: 1,
    });
    const program = new Command();
    registerPaperAndBacktestCommands(program);
    await program.parseAsync(['node', 'test', 'status']);

    const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('Capital   : $1050.25'))).toBe(true);
    expect(calls.some((c) => c.includes('Total P&L : -$45.50'))).toBe(true);
    expect(calls.some((c) => c.includes('Win Rate: 50.0%'))).toBe(true);
  });

  it('status displays 0.0% win rate when winCount and lossCount are 0', async () => {
    vi.mocked(store.readJson).mockReturnValue({
      capital: 1000,
      totalPnl: 0,
      positions: [],
      closedTrades: [],
      winCount: 0,
      lossCount: 0,
    });
    const program = new Command();
    registerPaperAndBacktestCommands(program);
    await program.parseAsync(['node', 'test', 'status']);

    const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('Win Rate: 0.0%'))).toBe(true);
  });

  it('backtest command handles missing or empty files and runs runner', async () => {
    vi.mocked(store.readJson).mockReturnValue(null);
    const program = new Command();
    registerPaperAndBacktestCommands(program);

    await program.parseAsync(['node', 'test', 'backtest', '--capital', '-5']);
    expect(logger.error).toHaveBeenCalledWith('Error: --capital must be a positive number');
    expect(exitSpy).toHaveBeenCalledWith(1);

    vi.clearAllMocks();
    await program.parseAsync(['node', 'test', 'backtest']);
    expect(exitSpy).toHaveBeenCalledWith(1);

    vi.clearAllMocks();
    vi.mocked(store.readJson).mockReturnValue({ capital: 1000, totalPnl: 0, closedTrades: [] });
    await program.parseAsync(['node', 'test', 'backtest']);
    expect(logger.info).toHaveBeenCalledWith('No closed trades in file. Keep trading to build history.');
  });

  it('backtest runs runner with trades and formats output in table and json', async () => {
    const mockTrades = [
      { id: 't1', pnlUsd: 25.5, entryPrice: 0.4, exitPrice: 0.6, entryTime: 1000, exitTime: 2000 },
      { id: 't2', pnlUsd: -10.2, entryPrice: 0.5, exitPrice: 0.3, entryTime: 3000, exitTime: 4000 },
    ];
    vi.mocked(store.readJson).mockReturnValue({ capital: 1000, totalPnl: 15.3, closedTrades: mockTrades });

    const program = new Command();
    registerPaperAndBacktestCommands(program);

    await program.parseAsync(['node', 'test', 'backtest', '--format', 'json']);
    const callsJson = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(callsJson.some((c) => c.includes('"totalTrades"'))).toBe(true);

    vi.clearAllMocks();
    vi.mocked(store.readJson).mockReturnValue({ capital: 1000, totalPnl: 15.3, closedTrades: mockTrades });
    const program2 = new Command();
    registerPaperAndBacktestCommands(program2);
    await program2.parseAsync(['node', 'test', 'backtest', '--format', 'table']);
    const callsTable = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(callsTable.some((c) => c.includes('Strategy: paper-trading'))).toBe(true);
    expect(callsTable.some((c) => c.includes('Total P&L:'))).toBe(true);
  });
});

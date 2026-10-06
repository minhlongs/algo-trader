import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { registerTradeCommands } from '../../../../src/desk/cli/cashclaw-trade-commands';

describe('cashclaw-trade-commands', () => {
  it('registers all 7 trade subcommands with proper options and actions', () => {
    const parent = new Command('cashclaw');
    const tradeCmd = parent.command('trade');

    registerTradeCommands(tradeCmd);

    const commandNames = tradeCmd.commands.map((cmd) => cmd.name());
    expect(commandNames).toContain('start');
    expect(commandNames).toContain('status');
    expect(commandNames).toContain('list-strategies');
    expect(commandNames).toContain('run');
    expect(commandNames).toContain('demo');
    expect(commandNames).toContain('journal');
    expect(commandNames).toContain('backtest');

    const backtestCmd = tradeCmd.commands.find((cmd) => cmd.name() === 'backtest');
    expect(backtestCmd).toBeDefined();
    const formatOpt = backtestCmd?.options.find((opt) => opt.attributeName() === 'format');
    expect(formatOpt).toBeDefined();
  });
});

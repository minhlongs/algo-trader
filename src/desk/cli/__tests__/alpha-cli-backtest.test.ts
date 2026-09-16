import './alpha-cli-fixtures';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../../shared/utils/logger';
import { createAlphaCmd, runCommand } from './alpha-cli-fixtures';

describe('alpha backtest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces output for a valid experiment config', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['backtest', 'rsi-mean-reversion-btc-1h']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = infoCalls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Backtest:');
    expect(allOutput).toContain('rsi-mean-reversion-btc-1h');
    expect(allOutput).toContain('train');
    expect(allOutput).toContain('val');
    expect(allOutput).toContain('test');
  });

  it('exits non-zero for unknown experiment', async () => {
    const cmd = createAlphaCmd();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    await runCommand(cmd, ['backtest', 'nonexistent-experiment']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('supports --json flag', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['backtest', 'rsi-mean-reversion-btc-1h', '--json']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const jsonOutput = infoCalls.map((c) => c[0]).find((s) => s.includes('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.experimentId).toBe('rsi-mean-reversion-btc-1h');
    expect(parsed.train).toBeDefined();
    expect(parsed.val).toBeDefined();
    expect(parsed.test).toBeDefined();
  });
});

describe('alpha compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces a side-by-side comparison for two experiments', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, [
      'compare',
      'rsi-mean-reversion-btc-1h',
      'volume-breakout-eth-4h',
    ]);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = infoCalls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('Compare:');
    expect(allOutput).toContain('rsi-mean-reversion-btc-1h');
    expect(allOutput).toContain('volume-breakout-eth-4h');
    expect(allOutput).toContain('Winner');
  });

  it('supports --json flag', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, [
      'compare',
      'rsi-mean-reversion-btc-1h',
      'volume-breakout-eth-4h',
      '--json',
    ]);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const jsonOutput = infoCalls.map((c) => c[0]).find((s) => s.includes('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.experimentA).toBe('rsi-mean-reversion-btc-1h');
    expect(parsed.experimentB).toBe('volume-breakout-eth-4h');
    expect(Array.isArray(parsed.metrics)).toBe(true);
    expect(parsed.metrics.length).toBeGreaterThan(0);
  });
});

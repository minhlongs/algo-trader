import './alpha-cli-fixtures';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../../shared/utils/logger';
import { createAlphaCmd, runCommand } from './alpha-cli-fixtures';

describe('alpha candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists all experiment configs from alpha-lab/configs/', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['candidates']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const allOutput = infoCalls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('rsi-mean-reversion-btc-1h');
    expect(allOutput).toContain('volume-breakout-eth-4h');
    expect(allOutput).toContain('multi-factor-momentum-sol-4h');
  });

  it('supports --json flag for machine-readable output', async () => {
    const cmd = createAlphaCmd();
    await runCommand(cmd, ['candidates', '--json']);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const jsonOutput = infoCalls.map((c) => c[0]).find((s) => s.includes('{'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(Array.isArray(parsed.configs)).toBe(true);
    expect(parsed.configs.length).toBe(3);
    expect(Array.isArray(parsed.baselines)).toBe(true);
    expect(parsed.baselines).toContain('buy-and-hold');
  });
});

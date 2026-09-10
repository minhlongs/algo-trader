/**
 * Tests for alpha-commands — registerAlphaCommands.
 *
 * Covers: command registration, option parsing, error handling,
 * and delegation to handlers for all 8 subcommands.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));

const { mockHandleCandidates } = vi.hoisted(() => ({ mockHandleCandidates: vi.fn() }));
const { mockHandleDiscover } = vi.hoisted(() => ({ mockHandleDiscover: vi.fn().mockResolvedValue(undefined) }));
const { mockHandleBacktest } = vi.hoisted(() => ({ mockHandleBacktest: vi.fn().mockResolvedValue(undefined) }));
const { mockHandleWalkforward } = vi.hoisted(() => ({ mockHandleWalkforward: vi.fn().mockResolvedValue(undefined) }));
const { mockHandleCompare } = vi.hoisted(() => ({ mockHandleCompare: vi.fn().mockResolvedValue(undefined) }));
const { mockHandleReport } = vi.hoisted(() => ({ mockHandleReport: vi.fn().mockResolvedValue(undefined) }));
const { mockHandleAblation } = vi.hoisted(() => ({ mockHandleAblation: vi.fn().mockResolvedValue(undefined) }));
const { mockHandleRobustness } = vi.hoisted(() => ({ mockHandleRobustness: vi.fn().mockResolvedValue(undefined) }));

vi.mock('../../../../src/desk/cli/alpha-candidates-handler', () => ({ handleCandidates: mockHandleCandidates }));
vi.mock('../../../../src/desk/cli/alpha-discover-handler', () => ({ handleDiscover: mockHandleDiscover }));
vi.mock('../../../../src/desk/cli/alpha-backtest-handler', () => ({ handleBacktest: mockHandleBacktest }));
vi.mock('../../../../src/desk/cli/alpha-walkforward-handler', () => ({ handleWalkforward: mockHandleWalkforward }));
vi.mock('../../../../src/desk/cli/alpha-compare-handler', () => ({ handleCompare: mockHandleCompare }));
vi.mock('../../../../src/desk/cli/alpha-report-handler', () => ({ handleReport: mockHandleReport }));
vi.mock('../../../../src/desk/cli/alpha-ablation-handler', () => ({ handleAblation: mockHandleAblation }));
vi.mock('../../../../src/desk/cli/alpha-robustness-handler', () => ({ handleRobustness: mockHandleRobustness }));

import { registerAlphaCommands } from '../../../../src/desk/cli/alpha-commands';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockCommand(): any {
  const subcommands: any[] = [];
  const cmd: any = {
    command(name: string) {
      const sub: any = {
        name,
        baseName: name.split(' ')[0],
        _opts: [] as string[],
        description() { return sub; },
        option(opt: string) { sub._opts.push(opt); return sub; },
        action(fn: (...args: unknown[]) => unknown) { sub._action = fn; return sub; },
      };
      subcommands.push(sub);
      return sub;
    },
    _subcommands: subcommands,
  };
  return cmd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('registerAlphaCommands', () => {
  it('registers 8 subcommands', () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    expect(cmd._subcommands).toHaveLength(8);
    const names = cmd._subcommands.map((s: any) => s.baseName);
    expect(names).toEqual([
      'candidates', 'discover', 'backtest', 'walkforward',
      'compare', 'report', 'ablation', 'robustness',
    ]);
  });

  it('candidates action calls handleCandidates with opts', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'candidates');
    await sub._action({ json: true });
    expect(mockHandleCandidates).toHaveBeenCalledWith({ json: true });
  });

  it('candidates action logs error and exits on failure', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleCandidates.mockImplementation(() => { throw new Error('boom'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'candidates');
    await sub._action({});
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to list candidates:', 'boom');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('discover action calls handleDiscover with symbol and opts', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'discover');
    await sub._action('BTC', { tf: '4h', json: true });
    expect(mockHandleDiscover).toHaveBeenCalledWith('BTC', { tf: '4h', json: true });
  });

  it('discover logs error on failure', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleDiscover.mockImplementation(() => { throw new Error('disc fail'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'discover');
    await sub._action('BTC', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Discover failed:', 'disc fail');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('backtest action calls handleBacktest', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'backtest');
    await sub._action('ETH', { json: false });
    expect(mockHandleBacktest).toHaveBeenCalledWith('ETH', { json: false });
  });

  it('walkforward action calls handleWalkforward', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'walkforward');
    await sub._action('BTC', {});
    expect(mockHandleWalkforward).toHaveBeenCalledWith('BTC', {});
  });

  it('compare action calls handleCompare', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'compare');
    await sub._action('BTC', 'ETH', { json: true });
    expect(mockHandleCompare).toHaveBeenCalledWith('BTC', 'ETH', { json: true });
  });

  it('report action calls handleReport', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'report');
    await sub._action('BTC', {});
    expect(mockHandleReport).toHaveBeenCalledWith('BTC', {});
  });

  it('ablation action calls handleAblation', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'ablation');
    await sub._action('BTC', {});
    expect(mockHandleAblation).toHaveBeenCalledWith('BTC', {});
  });

  it('robustness action calls handleRobustness', async () => {
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'robustness');
    await sub._action('BTC', {});
    expect(mockHandleRobustness).toHaveBeenCalledWith('BTC', {});
  });

  it('error handler logs with correct prefix for walkforward', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleWalkforward.mockImplementation(() => { throw new Error('wf'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'walkforward');
    await sub._action('BTC', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Walk-forward failed:', 'wf');
    exitSpy.mockRestore();
  });

  it('error handler logs with correct prefix for compare', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleCompare.mockImplementation(() => { throw new Error('cmp'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'compare');
    await sub._action('A', 'B', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Compare failed:', 'cmp');
    exitSpy.mockRestore();
  });

  it('error handler logs with correct prefix for report', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleReport.mockImplementation(() => { throw new Error('rep'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'report');
    await sub._action('BTC', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Report failed:', 'rep');
    exitSpy.mockRestore();
  });

  it('error handler logs with correct prefix for ablation', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleAblation.mockImplementation(() => { throw new Error('abl'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'ablation');
    await sub._action('BTC', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Ablation failed:', 'abl');
    exitSpy.mockRestore();
  });

  it('error handler logs with correct prefix for robustness', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleRobustness.mockImplementation(() => { throw new Error('rob'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'robustness');
    await sub._action('BTC', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Robustness test failed:', 'rob');
    exitSpy.mockRestore();
  });

  it('error handler logs with correct prefix for backtest', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    mockHandleBacktest.mockImplementation(() => { throw new Error('bt'); });
    const cmd = createMockCommand();
    registerAlphaCommands(cmd);
    const sub = cmd._subcommands.find((s: any) => s.baseName === 'backtest');
    await sub._action('BTC', {});
    expect(mockLogger.error).toHaveBeenCalledWith('Backtest failed:', 'bt');
    exitSpy.mockRestore();
  });
});
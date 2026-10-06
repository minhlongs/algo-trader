import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerScanCommands } from '../../../../src/desk/cli/cashclaw-cli-scan';
import { logger } from '../../../../src/shared/utils/logger';
import * as negRisk from '../../../../src/desk/commands/neg-risk-scan';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../../src/desk/commands/neg-risk-scan', () => ({
  runNegRiskScan: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/desk/polymarket/real-trade-ledger', () => ({
  showRealLedger: vi.fn().mockResolvedValue(undefined),
}));

describe('cashclaw-cli-scan', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('registers scan, neg-risk-scan, and ledger commands', () => {
    const program = new Command();
    registerScanCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('scan');
    expect(names).toContain('neg-risk-scan');
    expect(names).toContain('ledger');
  });

  it('runs scan command with mocked Polymarket response including malformed entries and >10 limit', async () => {
    const mockMarkets = [
      { question: 'BTC 100k?', outcomePrices: JSON.stringify(['0.97', '0.03']), volume: 25000 },
      { question: 'ETH 5k?', outcomePrices: JSON.stringify(['0.02', '0.98']), volume: 15000 },
      { question: 'Low volume', outcomePrices: JSON.stringify(['0.98', '0.02']), volume: 500 },
      { question: 'Malformed JSON', outcomePrices: 'invalid{', volume: 50000 },
      ...Array.from({ length: 10 }, (_, i) => ({
        question: `Market ${i + 1}`,
        outcomePrices: JSON.stringify(['0.96', '0.04']),
        volume: 20000,
      })),
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockMarkets,
    }));

    const program = new Command();
    registerScanCommands(program);

    await program.parseAsync(['node', 'test', 'scan']);

    const calls = vi.mocked(logger.info).mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('Found 12 endgame opportunities'))).toBe(true);
    expect(calls.some((c) => c.includes('[YES] @0.970'))).toBe(true);
    expect(calls.some((c) => c.includes('[NO] @0.020'))).toBe(true);
  });

  it('handles scan error on non-ok API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    const program = new Command();
    registerScanCommands(program);

    await program.parseAsync(['node', 'test', 'scan']);

    expect(logger.error).toHaveBeenCalledWith('Gamma API error: HTTP 500');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('executes neg-risk-scan command with parsed options', async () => {
    const program = new Command();
    registerScanCommands(program);

    await program.parseAsync([
      'node',
      'test',
      'neg-risk-scan',
      '--threshold',
      '0.95',
      '--minVolume',
      '2000',
      '--maxSize',
      '25',
    ]);

    expect(negRisk.runNegRiskScan).toHaveBeenCalledWith({
      threshold: 0.95,
      minVolumeUsdc: 2000,
      maxOpportunitySizeUsdc: 25,
    });
  });

  it('executes ledger command with wallet address', async () => {
    const program = new Command();
    registerScanCommands(program);

    await program.parseAsync(['node', 'test', 'ledger', '0x1234567890abcdef']);

    const { showRealLedger } = await import('../../../../src/desk/polymarket/real-trade-ledger');
    expect(showRealLedger).toHaveBeenCalledWith('0x1234567890abcdef');
  });
});

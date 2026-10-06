/**
 * CLI Diagnostics Unit Test Suite
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  formatCliDiagnostic,
  formatCurrencyPnl,
  wrapCliAction,
} from '../../../../src/desk/cli/cli-diagnostics';
import { logger } from '../../../../src/shared/utils/logger';

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('formatCliDiagnostic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats ZodError into structured actionable bullet points', () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const TestSchema = z.object({
      mode: z.enum(['PAPER', 'SHADOW', 'LIVE']),
      capital: z.number().positive(),
    });

    try {
      TestSchema.parse({ mode: 'INVALID', capital: -100 });
      expect.fail('Should have thrown ZodError');
    } catch (err) {
      const result = formatCliDiagnostic(err);
      expect(result.title).toBe('Invalid CLI options');
      expect(result.messages.length).toBe(2);
      expect(result.messages[0]).toContain('--mode');
      expect(result.messages[1]).toContain('--capital');
      expect(errorSpy).toHaveBeenCalled();
    }
  });

  it('handles duck-typed ZodError with empty issue path', () => {
    const mockZod = {
      name: 'ZodError',
      issues: [{ path: [], message: 'Global option invalid' }],
    };
    const result = formatCliDiagnostic(mockZod);
    expect(result.title).toBe('Invalid CLI options');
    expect(result.messages[0]).toContain('--option');
  });

  it('formats ECONNREFUSED network errors with remediation guidance', () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const networkErr = new Error('connect ECONNREFUSED 127.0.0.1:9100');

    const result = formatCliDiagnostic(networkErr);
    expect(result.title).toBe('Desk Daemon Connection Error');
    expect(result.messages.some((m) => m.includes('algo-trader desk:auto'))).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('formats generic exceptions without leaking V8 stack traces', () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const err = new Error('Database file corrupted');

    const result = formatCliDiagnostic(err);
    expect(result.title).toBe('Command Error');
    expect(result.messages[0]).toBe('  ✖ Database file corrupted');
    expect(errorSpy).toHaveBeenCalledWith('Command failed: Database file corrupted');
  });

  it('formats non-Error primitives and null gracefully', () => {
    const resString = formatCliDiagnostic('Direct string failure');
    expect(resString.messages[0]).toBe('  ✖ Direct string failure');

    const resNull = formatCliDiagnostic(null);
    expect(resNull.messages[0]).toBe('  ✖ Unknown error');
  });
});

describe('formatCurrencyPnl', () => {
  it('formats positive PnL as $X.XX', () => {
    expect(formatCurrencyPnl(123.45)).toBe('$123.45');
    expect(formatCurrencyPnl('50.5')).toBe('$50.50');
  });

  it('formats negative PnL as -$X.XX (not inverted $-X.XX)', () => {
    expect(formatCurrencyPnl(-15.2)).toBe('-$15.20');
    expect(formatCurrencyPnl('-100.05')).toBe('-$100.05');
  });

  it('formats zero and near-zero values as $0.00 without negative sign', () => {
    expect(formatCurrencyPnl(0)).toBe('$0.00');
    expect(formatCurrencyPnl(-0.001)).toBe('$0.00');
    expect(formatCurrencyPnl(0.001)).toBe('$0.00');
    expect(formatCurrencyPnl(NaN)).toBe('$0.00');
    expect(formatCurrencyPnl('invalid-number')).toBe('$0.00');
  });
});

describe('wrapCliAction', () => {
  const origExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = origExitCode;
  });

  it('executes successful action without error', async () => {
    const actionFn = vi.fn().mockResolvedValue('ok');
    const wrapped = wrapCliAction(actionFn);

    await wrapped('arg1');
    expect(actionFn).toHaveBeenCalledWith('arg1');
    expect(process.exitCode).toBe(origExitCode);
  });

  it('catches asynchronous rejection, formats diagnostic, and sets exitCode to 1 (Rule H4)', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const actionFn = vi.fn().mockRejectedValue(new Error('Unexpected network failure'));
    const wrapped = wrapCliAction(actionFn);

    await wrapped();
    expect(errorSpy).toHaveBeenCalledWith('Command failed: Unexpected network failure');
    expect(process.exitCode).toBe(1);
  });

  it('catches synchronous exception and formats diagnostic', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const actionFn = vi.fn().mockImplementation(() => {
      throw new Error('Sync throw');
    });
    const wrapped = wrapCliAction(actionFn);

    await wrapped();
    expect(errorSpy).toHaveBeenCalledWith('Command failed: Sync throw');
    expect(process.exitCode).toBe(1);
  });
});

/**
 * CLI Diagnostics Unit Test Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { formatCliDiagnostic } from '../../../../src/desk/cli/cli-diagnostics';
import { logger } from '../../../../src/shared/utils/logger';

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
});

/**
 * check-gates-cli — Unit Tests
 *
 * Covers runCheckGates, main, and re-exports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runCheckGates,
  main,
  renderGateTable,
  formatGateValue,
  formatThreshold,
} from '../check-gates';

vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../desk/tests/exchange-connection-test', () => ({
  ExchangeConnectionTester: class {
    testAll() {
      return Promise.resolve([
        { restOk: true, wsOk: true, error: null },
      ]);
    }
  },
}));

describe('check-gates-cli', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('re-exports', () => {
    it('re-exports table rendering functions', () => {
      expect(renderGateTable).toBeDefined();
      expect(formatGateValue).toBeDefined();
      expect(formatThreshold).toBeDefined();
    });
  });

  describe('runCheckGates', () => {
    it('returns 1 when gates fail', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      let output = '';
      const stdout = {
        write: (msg: string) => {
          output += msg;
        },
      };

      const code = await runCheckGates(stdout);
      expect(code).toBe(1);
      expect(output).toContain('=== Transition Criteria Gate Status ===');
    });

    it('returns 0 when all gates pass', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      let output = '';
      const stdout = {
        write: (msg: string) => {
          output += msg;
        },
      };
      const mockEvaluator = () => ({
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: true,
        passedCount: 1,
        totalGates: 1,
        estimatedDaysRemaining: null,
        gates: [
          { id: 'kelly_wired' as const, name: 'Kelly', currentValue: 1, threshold: null, passed: true, details: 'PASS' },
        ],
      });

      const code = await runCheckGates(stdout, mockEvaluator);
      expect(code).toBe(0);
      expect(output).toContain('STATUS: ALL GATES PASSING');
    });
  });

  describe('main', () => {
    it('calls process.exit with the result code', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ trades: [] }),
      }));
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
        (() => {}) as unknown as (code?: string | number | null | undefined) => never,
      );

      await main();
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
      stdoutSpy.mockRestore();
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  renderGateTable,
  formatGateValue,
  formatThreshold,
} from '../check-gates-table';
import type { PromotionReadiness } from '../gates/gate-types';

describe('check-gates-table', () => {
  describe('formatGateValue', () => {
    it('returns N/A for null currentValue', () => {
      expect(formatGateValue({ currentValue: null, id: 'duration' })).toBe('N/A');
    });

    it('formats win_rate as percentage', () => {
      expect(formatGateValue({ currentValue: 0.625, id: 'win_rate' })).toBe('62.5%');
    });

    it('formats max_drawdown as percentage', () => {
      expect(formatGateValue({ currentValue: 0.123, id: 'max_drawdown' })).toBe('12.3%');
    });

    it('formats boolean gates as Yes/No', () => {
      expect(formatGateValue({ currentValue: 1, id: 'kelly_wired' })).toBe('Yes');
      expect(formatGateValue({ currentValue: 0, id: 'circuit_breaker' })).toBe('No');
      expect(formatGateValue({ currentValue: 1, id: 'exchange_connectivity' })).toBe('Yes');
      expect(formatGateValue({ currentValue: 2, id: 'exchange_connectivity' })).toBe('No');
    });

    it('formats numeric values rounded to 2 decimals', () => {
      expect(formatGateValue({ currentValue: 3.14159, id: 'sharpe_ratio' })).toBe('3.14');
      expect(formatGateValue({ currentValue: 3.567, id: 'profit_factor' })).toBe('3.57');
    });
  });

  describe('formatThreshold', () => {
    it('returns dash for null threshold', () => {
      expect(formatThreshold({ threshold: null, id: 'win_rate' })).toBe('-');
    });

    it('returns dash when gate id is not found in GATE_THRESHOLDS', () => {
      expect(formatThreshold({ threshold: 10, id: 'unknown_gate_id' })).toBe('-');
    });

    it('formats win_rate with >= prefix and percentage', () => {
      expect(formatThreshold({ threshold: 0.55, id: 'win_rate' })).toBe('>= 55%');
    });

    it('formats max_drawdown with <= prefix and percentage', () => {
      expect(formatThreshold({ threshold: 0.1, id: 'max_drawdown' })).toBe('<= 10%');
    });

    it('formats duration with >= prefix and d suffix', () => {
      expect(formatThreshold({ threshold: 14, id: 'duration' })).toBe('>= 14d');
    });

    it('formats numeric thresholds with prefix', () => {
      expect(formatThreshold({ threshold: 2.0, id: 'profit_factor' })).toBe('>= 2');
      expect(formatThreshold({ threshold: 1.5, id: 'sharpe_ratio' })).toBe('>= 1.5');
    });
  });

  describe('renderGateTable', () => {
    it('renders all-pass result with PASS status and eligibility message', () => {
      const reading: PromotionReadiness = {
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: true,
        passedCount: 3,
        totalGates: 3,
        estimatedDaysRemaining: null,
        gates: [
          { id: 'win_rate', name: 'Win Rate Gate', currentValue: 0.6, threshold: 0.55, direction: 'at_least', passed: true },
          { id: 'duration', name: 'Duration Gate', currentValue: 30, threshold: 14, direction: 'at_least', passed: true },
          { id: 'kelly_wired', name: 'Kelly Wired Gate', currentValue: 1, threshold: 1, direction: 'at_least', passed: true },
        ],
      };

      const output = renderGateTable(reading);
      expect(output).toContain('=== Transition Criteria Gate Status ===');
      expect(output).toContain('Evaluated: 2026-08-31T12:00:00Z');
      expect(output).toContain('Result: 3/3 gates passing');
      expect(output).toContain('STATUS: ALL GATES PASSING — eligible for live promotion');
      expect(output).toContain('PASS');
    });

    it('renders failing result with FAIL status and gate count', () => {
      const reading: PromotionReadiness = {
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: false,
        passedCount: 1,
        totalGates: 3,
        estimatedDaysRemaining: 5,
        gates: [
          { id: 'win_rate', name: 'Win Rate Gate', currentValue: 0.4, threshold: 0.55, direction: 'at_least', passed: false },
          { id: 'max_drawdown', name: 'Max Drawdown Gate', currentValue: 0.15, threshold: 0.10, direction: 'at_most', passed: false },
          { id: 'duration', name: 'Duration Gate', currentValue: 10, threshold: 14, direction: 'at_least', passed: true },
        ],
      };

      const output = renderGateTable(reading);
      expect(output).toContain('Result: 1/3 gates passing');
      expect(output).toContain('STATUS: 2 gate(s) still failing');
      expect(output).toContain('Estimated days until duration gate: 5');
    });

    it('omits estimated days line when estimatedDaysRemaining is null or 0', () => {
      const readingNull: PromotionReadiness = {
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: false,
        passedCount: 0,
        totalGates: 1,
        estimatedDaysRemaining: null,
        gates: [
          { id: 'duration', name: 'Duration Gate', currentValue: null, threshold: 14, direction: 'at_least', passed: false },
        ],
      };
      expect(renderGateTable(readingNull)).not.toContain('Estimated days');

      const readingZero: PromotionReadiness = {
        evaluatedAt: '2026-08-31T12:00:00Z',
        allPassed: false,
        passedCount: 0,
        totalGates: 1,
        estimatedDaysRemaining: 0,
        gates: [
          { id: 'duration', name: 'Duration Gate', currentValue: null, threshold: 14, direction: 'at_least', passed: false },
        ],
      };
      expect(renderGateTable(readingZero)).not.toContain('Estimated days');
    });
  });
});

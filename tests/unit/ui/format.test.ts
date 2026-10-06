import { describe, it, expect } from 'vitest';
import {
  formatUsd,
  formatCurrency,
  formatPct,
  formatPercent,
  formatPnl,
  formatBrier,
  timeAgo,
} from '../../../src/ui/shared/format.js';

describe('format utilities (src/ui/shared/format.js)', () => {
  describe('formatUsd and formatCurrency', () => {
    it('formats positive numbers with dollar sign and commas', () => {
      expect(formatUsd(123.456)).toBe('$123.46');
      expect(formatCurrency(100000)).toBe('$100,000.00');
      expect(formatUsd(0)).toBe('$0.00');
    });

    it('formats negative numbers with standard -$ sign before dollar sign', () => {
      expect(formatUsd(-50)).toBe('-$50.00');
      expect(formatCurrency(-150.25)).toBe('-$150.25');
      expect(formatCurrency(-100000)).toBe('-$100,000.00');
    });

    it('formats sub-cent negative numbers as $0.00 instead of -$0.00', () => {
      expect(formatUsd(-0.0001)).toBe('$0.00');
      expect(formatCurrency(-0.0049)).toBe('$0.00');
      expect(formatUsd(-1e-8)).toBe('$0.00');
    });

    it('safely handles null, undefined, NaN, and non-coercible objects by returning "—"', () => {
      expect(formatUsd(null)).toBe('—');
      expect(formatUsd(undefined)).toBe('—');
      expect(formatUsd(Number.NaN)).toBe('—');
      expect(formatCurrency(undefined)).toBe('—');
      expect(formatUsd(Symbol('test') as unknown as number)).toBe('—');
      expect(formatUsd(Object.create(null))).toBe('—');
    });
  });

  describe('formatPct and formatPercent', () => {
    it('formats decimal numbers as percentages with 2 decimals', () => {
      expect(formatPct(0.1234)).toBe('12.34%');
      expect(formatPercent(0.5)).toBe('50.00%');
      expect(formatPct(0)).toBe('0.00%');
    });

    it('safely handles null, undefined, NaN, and non-coercible objects without returning "NaN%"', () => {
      expect(formatPct(null)).toBe('—');
      expect(formatPct(undefined)).toBe('—');
      expect(formatPct(Number.NaN)).toBe('—');
      expect(formatPercent(undefined)).toBe('—');
      expect(formatPct(Symbol('test') as unknown as number)).toBe('—');
      expect(formatPct(Object.create(null))).toBe('—');
    });
  });

  describe('formatBrier', () => {
    it('formats valid brier numbers to 3 decimals', () => {
      expect(formatBrier(0.182)).toBe('0.182');
      expect(formatBrier(0)).toBe('0.000');
      expect(formatBrier(0.25)).toBe('0.250');
    });

    it('safely handles undefined, null, NaN, and non-coercible objects without throwing TypeError', () => {
      expect(() => formatBrier(undefined)).not.toThrow();
      expect(formatBrier(undefined)).toBe('—');
      expect(formatBrier(null)).toBe('—');
      expect(formatBrier(Number.NaN)).toBe('—');
      expect(formatBrier(Symbol('test') as unknown as number)).toBe('—');
      expect(formatBrier(Object.create(null))).toBe('—');
    });
  });

  describe('formatPnl', () => {
    it('formats positive PnL with plus sign and profit class', () => {
      const res = formatPnl(50.25);
      expect(res.text).toBe('+$50.25');
      expect(res.className).toBe('cc-pnl--positive');
    });

    it('formats negative PnL with minus sign and loss class', () => {
      const res = formatPnl(-12.30);
      expect(res.text).toBe('-$12.30');
      expect(res.className).toBe('cc-pnl--negative');
    });

    it('formats zero PnL with zero class', () => {
      const res = formatPnl(0);
      expect(res.text).toBe('$0.00');
      expect(res.className).toBe('cc-pnl--zero');
    });

    it('formats sub-cent negative PnL as zero class without -$0.00', () => {
      const res = formatPnl(-0.0001);
      expect(res.text).toBe('$0.00');
      expect(res.className).toBe('cc-pnl--zero');
    });

    it('safely handles undefined/null/NaN and non-coercible objects', () => {
      const res = formatPnl(undefined);
      expect(res.text).toBe('—');
      expect(res.className).toBe('cc-pnl--zero');
      const symRes = formatPnl(Symbol('test') as unknown as number);
      expect(symRes.text).toBe('—');
      expect(symRes.className).toBe('cc-pnl--zero');
    });
  });

  describe('timeAgo', () => {
    it('formats seconds, minutes, hours, days', () => {
      const now = Date.now();
      expect(timeAgo(now - 30000)).toBe('30s ago');
      expect(timeAgo(now - 120000)).toBe('2m ago');
      expect(timeAgo(now - 7200000)).toBe('2h ago');
      expect(timeAgo(now - 86400000 * 3)).toBe('3d ago');
    });

    it('handles falsy, invalid, or non-coercible timestamp safely', () => {
      expect(timeAgo(null)).toBe('—');
      expect(timeAgo(undefined)).toBe('—');
      expect(timeAgo(Number.NaN)).toBe('—');
      expect(timeAgo(Symbol('test') as unknown as number)).toBe('—');
      expect(timeAgo(Object.create(null))).toBe('—');
    });
  });
});

/**
 * Terminal Drawing & Table Alignment Verification Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printTable } from '../../../../src/desk/cli/alpha-helpers';
import { logger } from '../../../../src/shared/utils/logger';

describe('Terminal Drawing & Table Formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints table with complete Unicode borders including column joints (┬, ┼, ┴)', () => {
    const infoSpy = vi.spyOn(logger, 'info');

    const headers = ['Symbol', 'Strategy', 'Return'];
    const rows = [
      ['BTC/USDT', 'RSI-SMA', '+12.4%'],
      ['ETH/USDT', 'MACD-Cross', '-3.1%'],
    ];

    printTable(headers, rows);

    const calls = infoSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.length).toBe(6);

    // Top border has top joints ┬
    expect(calls[0]).toMatch(/^┌.*┬.*┬.*┐$/);
    // Header row
    expect(calls[1]).toContain('Symbol');
    expect(calls[1]).toContain('Strategy');
    expect(calls[1]).toContain('Return');
    // Separator has intersection joints ┼ (NOT right-edge ┤)
    expect(calls[2]).toMatch(/^├.*┼.*┼.*┤$/);
    expect(calls[2]).not.toMatch(/├.*┤.*┤/);
    // Data rows
    expect(calls[3]).toContain('BTC/USDT');
    expect(calls[4]).toContain('ETH/USDT');
    // Bottom border has bottom joints ┴
    expect(calls[5]).toMatch(/^└.*┴.*┴.*┘$/);
  });

  it('preserves alignment when ANSI color sequences are present in cells', () => {
    const infoSpy = vi.spyOn(logger, 'info');

    const headers = ['Task', 'Status'];
    const rows = [
      ['Build', '\x1b[32mPASS\x1b[0m'],
      ['Typecheck', '\x1b[31mFAIL\x1b[0m'],
    ];

    printTable(headers, rows);

    const calls = infoSpy.mock.calls.map((c) => c[0] as string);
    // Remove ANSI sequences to verify visible characters alignment
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const cleanRows = calls.map(strip);

    const expectedWidth = cleanRows[0].length;
    for (const r of cleanRows) {
      expect(r.length).toBe(expectedWidth);
    }
  });
});

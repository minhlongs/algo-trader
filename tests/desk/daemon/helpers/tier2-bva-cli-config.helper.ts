/**
 * Tier 2 BVA Tests: Configuration, Capital, Poll Interval, Port & Symbol Boundaries
 */

import { describe, it, expect } from 'vitest';
import { DeskAutoConfigSchema as HarnessSchema } from './daemon-test-harness';
import {
  DeskAutoConfigSchema as StrictSchema,
  normalizeDeskAutoOptions,
  parseDeskAutoConfig,
} from '../../../../src/desk/commands/desk-auto-types';

export function registerTier2CliConfigTests(): void {
  describe('Tier 2: Configuration & Capital Boundaries', () => {
    it('accepts minimum positive integer capital ($1)', () => {
      const config = StrictSchema.parse({ capitalUsd: 1 });
      expect(config.capitalUsd).toBe(1);
    });

    it('accepts fractional positive capital ($0.01)', () => {
      const config = StrictSchema.parse({ capitalUsd: 0.01 });
      expect(config.capitalUsd).toBe(0.01);
    });

    it('accepts institutional large capital ($1,000,000,000)', () => {
      const config = StrictSchema.parse({ capitalUsd: 1_000_000_000 });
      expect(config.capitalUsd).toBe(1_000_000_000);
    });

    it('accepts extreme capital ($1e12)', () => {
      const config = StrictSchema.parse({ capitalUsd: 1e12 });
      expect(config.capitalUsd).toBe(1e12);
    });

    it('rejects exact zero capital ($0)', () => {
      expect(() => StrictSchema.parse({ capitalUsd: 0 })).toThrow();
    });

    it('rejects negative capital (-$100)', () => {
      expect(() => StrictSchema.parse({ capitalUsd: -100 })).toThrow();
    });

    it('rejects sub-zero fractional capital (-$0.0001)', () => {
      expect(() => StrictSchema.parse({ capitalUsd: -0.0001 })).toThrow();
    });

    it('rejects non-numeric NaN capital', () => {
      expect(() => StrictSchema.parse({ capitalUsd: NaN })).toThrow();
    });

    it('normalizes string representation of capital ("500000" -> 500000)', () => {
      const config = parseDeskAutoConfig({ capital: '500000' });
      expect(config.capitalUsd).toBe(500_000);
    });

    it('accepts exact poll interval boundary of 50ms', () => {
      const config = StrictSchema.parse({ pollIntervalMs: 50 });
      expect(config.pollIntervalMs).toBe(50);
    });

    it('rejects poll interval below 50ms (49ms)', () => {
      expect(() => StrictSchema.parse({ pollIntervalMs: 49 })).toThrow();
    });

    it('rejects poll interval of 0ms', () => {
      expect(() => StrictSchema.parse({ pollIntervalMs: 0 })).toThrow();
    });

    it('rejects negative poll interval (-100ms)', () => {
      expect(() => StrictSchema.parse({ pollIntervalMs: -100 })).toThrow();
    });

    it('accepts massive poll interval (86,400,000ms / 24h)', () => {
      const config = StrictSchema.parse({ pollIntervalMs: 86_400_000 });
      expect(config.pollIntervalMs).toBe(86_400_000);
    });

    it('normalizes floating point poll interval by rounding (100.4 -> 100)', () => {
      const config = parseDeskAutoConfig({ pollInterval: 100.4 });
      expect(config.pollIntervalMs).toBe(100);
    });

    it('accepts boundary port 1024 (lowest unprivileged port)', () => {
      const config = StrictSchema.parse({ metricsPort: 1024 });
      expect(config.metricsPort).toBe(1024);
    });

    it('accepts boundary port 65535 (highest valid TCP port)', () => {
      const config = StrictSchema.parse({ metricsPort: 65535 });
      expect(config.metricsPort).toBe(65535);
    });

    it('rejects port 1023 in strict CLI config schema', () => {
      expect(() => StrictSchema.parse({ metricsPort: 1023 })).toThrow();
    });

    it('rejects port 65536 in strict CLI config schema', () => {
      expect(() => StrictSchema.parse({ metricsPort: 65536 })).toThrow();
    });

    it('rejects negative port (-1)', () => {
      expect(() => StrictSchema.parse({ metricsPort: -1 })).toThrow();
    });

    it('allows port 0 in test harness schema for ephemeral port assignment', () => {
      const config = HarnessSchema.parse({ metricsPort: 0 });
      expect(config.metricsPort).toBe(0);
    });

    it('rejects empty exchanges array', () => {
      expect(() => StrictSchema.parse({ exchanges: [] })).toThrow();
    });

    it('rejects empty symbols array', () => {
      expect(() => StrictSchema.parse({ symbols: [] })).toThrow();
    });

    it('rejects exchange entry that is an empty string', () => {
      expect(() => StrictSchema.parse({ exchanges: [''] })).toThrow();
    });

    it('rejects symbol entry that is an empty string', () => {
      expect(() => StrictSchema.parse({ symbols: [''] })).toThrow();
    });

    it('normalizes comma-delimited string of exchanges and filters empty entries', () => {
      const norm = normalizeDeskAutoOptions({ exchanges: 'binance,,bybit' });
      expect(norm['exchanges']).toEqual(['binance', 'bybit']);
    });

    it('normalizes comma-delimited string of symbols and filters empty entries', () => {
      const norm = normalizeDeskAutoOptions({ symbols: 'BTC/USDT, ,ETH/USDT' });
      expect(norm['symbols']).toEqual(['BTC/USDT', 'ETH/USDT']);
    });

    it('accepts non-negative duration boundary 0', () => {
      const config = StrictSchema.parse({ durationSeconds: 0 });
      expect(config.durationSeconds).toBe(0);
    });

    it('rejects negative duration (-1)', () => {
      expect(() => StrictSchema.parse({ durationSeconds: -1 })).toThrow();
    });
  });
}

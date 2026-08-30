/**
 * Tests for negative-risk-types — shared config, position shape, and the
 * tiny cooldown helpers used by entry/exit evaluators.
 *
 * These are the only executable statements in the module: DEFAULT_CONFIG,
 * STRATEGY_NAME, isOnCooldown, setCooldown. (ScannerRuntime / ArbPosition /
 * NegativeRiskScannerConfig are type-only and emit no runtime code.)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_CONFIG,
  STRATEGY_NAME,
  isOnCooldown,
  setCooldown,
} from '../negative-risk-types';

function makeRuntime(cooldownMs = 30_000, cooldowns = new Map<string, number>()) {
  return {
    positions: new Map<string, unknown>(),
    cooldowns,
    cfg: { threshold: 0.98, maxOpportunitySizeUsdc: 10, cooldownMs, minVolumeUsdc: 1000 },
    clob: {},
    orderManager: {},
    eventBus: {},
    gamma: {},
  };
}

describe('polymarket/negative-risk-types', () => {
  describe('DEFAULT_CONFIG', () => {
    it('exposes the documented defaults', () => {
      expect(DEFAULT_CONFIG.threshold).toBe(0.98);
      expect(DEFAULT_CONFIG.maxOpportunitySizeUsdc).toBe(10);
      expect(DEFAULT_CONFIG.cooldownMs).toBe(30_000);
      expect(DEFAULT_CONFIG.minVolumeUsdc).toBe(1000);
    });

    it('exposes the optional take-profit / stop-loss / hold-time defaults', () => {
      expect(DEFAULT_CONFIG.takeProfitPct).toBe(0.02);
      expect(DEFAULT_CONFIG.stopLossPct).toBe(0.015);
      expect(DEFAULT_CONFIG.maxHoldMs).toBe(60 * 60_000);
    });
  });

  describe('STRATEGY_NAME', () => {
    it('is the negative-risk-scanner name', () => {
      expect(STRATEGY_NAME).toBe('negative-risk-scanner');
    });
  });

  describe('isOnCooldown', () => {
    it('returns false when the market has no cooldown entry', () => {
      const runtime = makeRuntime();
      expect(isOnCooldown(runtime, 'm-missing')).toBe(false);
    });

    it('returns true while Date.now() is before the cooldown expiry', () => {
      vi.useFakeTimers();
      const now = Date.now();
      const runtime = makeRuntime(5_000);
      runtime.cooldowns.set('m-1', now + 2_000);
      // advance 1s — still inside the window
      vi.advanceTimersByTime(1_000);
      expect(isOnCooldown(runtime, 'm-1')).toBe(true);
      vi.useRealTimers();
    });

    it('returns false once the cooldown has expired', () => {
      vi.useFakeTimers();
      const now = Date.now();
      const runtime = makeRuntime(5_000);
      runtime.cooldowns.set('m-1', now + 2_000);
      // advance past expiry
      vi.advanceTimersByTime(3_000);
      expect(isOnCooldown(runtime, 'm-1')).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('setCooldown', () => {
    it('arms a cooldown of cfg.cooldownMs from the current time', () => {
      vi.useFakeTimers();
      const now = Date.now();
      const runtime = makeRuntime(15_000);
      setCooldown(runtime, 'm-2');
      expect(runtime.cooldowns.get('m-2')).toBe(now + 15_000);
      vi.useRealTimers();
    });

    it('uses the runtime-specific cooldownMs, not a constant', () => {
      vi.useFakeTimers();
      const now = Date.now();
      const runtime = makeRuntime(2_000);
      setCooldown(runtime, 'm-3');
      expect(runtime.cooldowns.get('m-3')).toBe(now + 2_000);
      vi.useRealTimers();
    });
  });
});
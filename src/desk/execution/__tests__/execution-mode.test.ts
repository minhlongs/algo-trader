/**
 * Execution mode tests — covers all three modes and the literal-string env gate.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getExecutionMode,
  resetExecutionModeCache,
  isLiveEnabled,
  isTradingEnabled,
  isReadOnly,
  requireTradingEnabled,
  requireLiveEnabled,
} from '../execution-mode';

const ORIGINAL = process.env.LIVE_TRADING_ENABLED;

beforeEach(() => {
  resetExecutionModeCache();
  delete process.env.LIVE_TRADING_ENABLED;
});

afterEach(() => {
  resetExecutionModeCache();
  if (ORIGINAL === undefined) delete process.env.LIVE_TRADING_ENABLED;
  else process.env.LIVE_TRADING_ENABLED = ORIGINAL;
});

describe('getExecutionMode', () => {
  it('defaults to READ_ONLY when the env var is unset', () => {
    expect(getExecutionMode()).toBe('READ_ONLY');
  });

  it('is LIVE only for the literal string "true"', () => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    expect(getExecutionMode()).toBe('LIVE');
  });

  it('stays READ_ONLY for "1", "yes", "TRUE", and empty string', () => {
    for (const value of ['1', 'yes', 'TRUE', '', 'false']) {
      resetExecutionModeCache();
      process.env.LIVE_TRADING_ENABLED = value;
      expect(getExecutionMode()).toBe('READ_ONLY');
    }
  });

  it('caches the mode after first read (runtime env mutation cannot flip it)', () => {
    expect(getExecutionMode()).toBe('READ_ONLY');
    process.env.LIVE_TRADING_ENABLED = 'true';
    expect(getExecutionMode()).toBe('READ_ONLY');
    resetExecutionModeCache();
    expect(getExecutionMode()).toBe('LIVE');
  });
});

describe('predicates', () => {
  it('READ_ONLY: isReadOnly true, isTradingEnabled false, isLiveEnabled false', () => {
    expect(isReadOnly()).toBe(true);
    expect(isTradingEnabled()).toBe(false);
    expect(isLiveEnabled()).toBe(false);
  });

  it('LIVE: isLiveEnabled true, isTradingEnabled true, isReadOnly false', () => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    expect(isLiveEnabled()).toBe(true);
    expect(isTradingEnabled()).toBe(true);
    expect(isReadOnly()).toBe(false);
  });
});

describe('guards', () => {
  it('requireTradingEnabled throws in READ_ONLY', () => {
    expect(() => requireTradingEnabled('test-op')).toThrow(/READ_ONLY/);
  });

  it('requireTradingEnabled passes in LIVE', () => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    expect(() => requireTradingEnabled('test-op')).not.toThrow();
  });

  it('requireLiveEnabled throws in READ_ONLY', () => {
    expect(() => requireLiveEnabled('test-op')).toThrow(/LIVE mode/);
  });

  it('requireLiveEnabled passes in LIVE', () => {
    process.env.LIVE_TRADING_ENABLED = 'true';
    expect(() => requireLiveEnabled('test-op')).not.toThrow();
  });
});

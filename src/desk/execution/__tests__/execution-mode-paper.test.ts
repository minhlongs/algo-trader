/**
 * The shared execution-mode resolver must be able to return PAPER.
 *
 * `ExecutionMode` declares three modes and `requireTradingEnabled()` documents
 * that PAPER permits order creation, but `resolveExecutionMode()` only ever
 * returned LIVE or READ_ONLY. The third mode was unreachable, so any caller
 * that wanted simulated paper fills instead got a hard READ_ONLY refusal.
 *
 * These tests pin the contract: READ_ONLY stays the default, LIVE requires the
 * literal string 'true', PAPER requires its own explicit signal, and PAPER must
 * never satisfy a live-only guard.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getExecutionMode,
  resetExecutionModeCache,
  isPaperEnabled,
  isTradingEnabled,
  isLiveEnabled,
  requireLiveEnabled,
} from '../execution-mode';

const ORIGINAL_LIVE = process.env.LIVE_TRADING_ENABLED;
const ORIGINAL_PAPER = process.env.PAPER_TRADING_ENABLED;

beforeEach(() => {
  resetExecutionModeCache();
  delete process.env.LIVE_TRADING_ENABLED;
  delete process.env.PAPER_TRADING_ENABLED;
});

afterEach(() => {
  resetExecutionModeCache();
  if (ORIGINAL_LIVE === undefined) delete process.env.LIVE_TRADING_ENABLED;
  else process.env.LIVE_TRADING_ENABLED = ORIGINAL_LIVE;
  if (ORIGINAL_PAPER === undefined) delete process.env.PAPER_TRADING_ENABLED;
  else process.env.PAPER_TRADING_ENABLED = ORIGINAL_PAPER;
});

describe('PAPER mode is reachable', () => {
  it('returns PAPER when paper trading is explicitly enabled and live is not', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    expect(getExecutionMode()).toBe('PAPER');
  });

  it('reports PAPER through isPaperEnabled', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    expect(isPaperEnabled()).toBe(true);
  });

  it('allows order creation in PAPER (isTradingEnabled true)', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    expect(isTradingEnabled()).toBe(true);
  });

  it('does not let PAPER satisfy a live-only guard', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    expect(isLiveEnabled()).toBe(false);
    expect(() => requireLiveEnabled('paper-op')).toThrow(/PAPER/);
  });

  it('keeps READ_ONLY as the default when neither flag is set', () => {
    expect(getExecutionMode()).toBe('READ_ONLY');
    expect(isTradingEnabled()).toBe(false);
  });

  it('does not treat the literal string "1" as paper trading', () => {
    process.env.PAPER_TRADING_ENABLED = '1';
    expect(getExecutionMode()).toBe('READ_ONLY');
  });

  it('lets LIVE win when both flags are set, because live is the stricter claim', () => {
    process.env.PAPER_TRADING_ENABLED = 'true';
    process.env.LIVE_TRADING_ENABLED = 'true';
    expect(getExecutionMode()).toBe('LIVE');
  });
});

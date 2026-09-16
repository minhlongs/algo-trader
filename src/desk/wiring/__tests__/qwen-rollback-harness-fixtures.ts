/**
 * Test fixtures and utilities for Qwen Rollback Harness tests
 */

export const NOW = Date.now();
export const DAYS_31_MS = 31 * 24 * 60 * 60 * 1000;
export const DAYS_10_MS = 10 * 24 * 60 * 60 * 1000;

export function setEnv(overrides: Record<string, string>) {
  Object.assign(process.env, overrides);
}

export function clearQwenEnv() {
  delete process.env.QWEN_KILL;
  delete process.env.QWEN_LIVE_ELIGIBLE;
  delete process.env.QWEN_AUTO_APPROVE_MAX_USD;
  delete process.env.QWEN_DRAWDOWN_MAX_PCT;
}

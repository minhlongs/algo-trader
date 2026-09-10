/**
 * Qwen Signals Loop — environment-driven config helpers.
 * All runtime thresholds and intervals are read at call time so tests can
 * override process.env without restarting the process.
 */

export const DEFAULT_INTERVAL_MS = 6 * 3600 * 1000;
export const DEFAULT_REVIEW_WINDOW_MS = 7 * 24 * 3600 * 1000;

export function getReviewWindowMs(): number {
  const raw = process.env.QWEN_REVIEW_WINDOW_MS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_REVIEW_WINDOW_MS;
  return isNaN(parsed) ? DEFAULT_REVIEW_WINDOW_MS : parsed;
}

export function getIntervalMs(): number {
  const raw = process.env.QWEN_SIGNALS_LOOP_INTERVAL_MS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_INTERVAL_MS;
  return isNaN(parsed) ? DEFAULT_INTERVAL_MS : parsed;
}

export function getWinRateMin(): number {
  const raw = process.env.QWEN_REVIEW_WIN_RATE_MIN;
  const parsed = raw ? parseFloat(raw) : 0.4;
  return isNaN(parsed) ? 0.4 : parsed;
}

export function getSharpeMin(): number {
  const raw = process.env.QWEN_REVIEW_SHARPE_MIN;
  const parsed = raw ? parseFloat(raw) : 0.5;
  return isNaN(parsed) ? 0.5 : parsed;
}

export function getMinSignals(): number {
  const raw = process.env.QWEN_REVIEW_MIN_SIGNALS;
  const parsed = raw ? parseInt(raw, 10) : 20;
  return isNaN(parsed) ? 20 : parsed;
}

export function getMinTradesForSharpe(): number {
  const raw = process.env.QWEN_REVIEW_MIN_TRADES_FOR_SHARPE;
  const parsed = raw ? parseInt(raw, 10) : 30;
  return isNaN(parsed) ? 30 : parsed;
}

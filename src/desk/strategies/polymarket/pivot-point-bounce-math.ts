/**
 * Pure math & pivot calculation helpers for Pivot Point Bounce V2 strategy.
 */

export function calcPivotPoints(
  high: number,
  low: number,
  close: number,
): { pivot: number; s1: number; r1: number } {
  const pivot = (high + low + close) / 3;
  const s1 = 2 * pivot - high;
  const r1 = 2 * pivot - low;
  return { pivot, s1, r1 };
}

export function isNearLevel(price: number, level: number, threshold: number): boolean {
  return Math.abs(price - level) <= threshold;
}

export function detectBounce(
  prices: number[],
  level: number,
  direction: 'up' | 'down',
  confirmTicks: number,
): boolean {
  if (prices.length < confirmTicks + 1) return false;

  const pivotIndex = prices.length - confirmTicks - 1;
  const pivotPrice = prices[pivotIndex];
  const threshold = Math.max(Math.abs(level) * 0.05, 0.02);
  if (Math.abs(pivotPrice - level) > threshold) return false;

  const tail = prices.slice(prices.length - confirmTicks);
  let prevPrice = prices[prices.length - confirmTicks - 1];

  for (const p of tail) {
    if (direction === 'up' && p < prevPrice) return false;
    if (direction === 'down' && p > prevPrice) return false;
    prevPrice = p;
  }

  const first = prices[prices.length - confirmTicks - 1];
  const last = prices[prices.length - 1];
  if (direction === 'up' && last <= first) return false;
  if (direction === 'down' && last >= first) return false;

  return true;
}

export function findHLC(prices: number[]): { high: number; low: number; close: number } {
  if (prices.length === 0) return { high: 0, low: 0, close: 0 };

  let high = -Infinity;
  let low = Infinity;

  for (const p of prices) {
    if (p > high) high = p;
    if (p < low) low = p;
  }

  return { high, low, close: prices[prices.length - 1] };
}

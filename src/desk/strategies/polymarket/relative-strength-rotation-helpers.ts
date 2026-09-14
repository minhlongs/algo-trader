/**
 * Pure Mathematical Helpers for Relative Strength Rotation Strategy.
 */

export function calcMomentum(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  const last = prices[prices.length - 1];
  return (last - first) / first;
}

export function rankByMomentum(
  momentums: Map<string, number>,
): { marketId: string; momentum: number; rank: number }[] {
  const entries = Array.from(momentums.entries()).map(([marketId, momentum]) => ({
    marketId, momentum, rank: 0,
  }));
  entries.sort((a, b) => b.momentum - a.momentum);
  for (let i = 0; i < entries.length; i++) entries[i].rank = i + 1;
  return entries;
}

export function selectLeaders(
  ranked: { marketId: string; rank: number }[], topNPercent: number,
): string[] {
  if (ranked.length === 0) return [];
  const cutoff = Math.max(1, Math.ceil(ranked.length * topNPercent));
  return ranked.filter(r => r.rank <= cutoff).map(r => r.marketId);
}

export function calcRankSpread(momentums: number[]): number {
  if (momentums.length === 0) return 0;
  let min = momentums[0], max = momentums[0];
  for (let i = 1; i < momentums.length; i++) {
    if (momentums[i] < min) min = momentums[i];
    if (momentums[i] > max) max = momentums[i];
  }
  return max - min;
}

/**
 * Cross-Event Drift Math Helpers
 * Returns, correlation, and leader/laggard drift identification.
 */

export function calcReturn(prices: number[], window: number): number {
  if (prices.length < 2 || window < 2) return 0;
  const n = Math.min(window, prices.length);
  const start = prices[prices.length - n];
  const end = prices[prices.length - 1];
  if (start === 0) return 0;
  return (end - start) / start;
}

export function calcCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const dA = a[i] - meanA;
    const dB = b[i] - meanB;
    cov += dA * dB;
    varA += dA * dA;
    varB += dB * dB;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

export function findLeaderLaggards(
  marketReturns: Map<string, number>,
  driftThreshold: number,
  followThreshold: number,
): { leader: { id: string; ret: number } | null; laggards: string[] } {
  let leader: { id: string; ret: number } | null = null;
  for (const [id, ret] of marketReturns) {
    if (Math.abs(ret) >= driftThreshold) {
      if (!leader || Math.abs(ret) > Math.abs(leader.ret)) leader = { id, ret };
    }
  }
  if (!leader) return { leader: null, laggards: [] };
  const laggards: string[] = [];
  for (const [id, ret] of marketReturns) {
    if (id !== leader.id && Math.abs(ret) < followThreshold) laggards.push(id);
  }
  return { leader, laggards };
}

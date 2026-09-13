/**
 * Momentum Cascade V2 — Math & Statistical Functions
 */

export function calcReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  if (first === 0) return 0;
  const last = prices[prices.length - 1];
  return (last - first) / first;
}

export function updateMomentumEma(prevEma: number | null, returnVal: number, alpha: number): number {
  if (prevEma === null) return returnVal;
  if (alpha <= 0) return prevEma;
  if (alpha >= 1) return returnVal;
  return alpha * returnVal + (1 - alpha) * prevEma;
}

export function findLeader(momentums: Map<string, number>): { marketId: string; momentum: number } | null {
  let bestId: string | null = null;
  let bestAbs = -1;
  let bestMom = 0;

  for (const [id, mom] of momentums) {
    const abs = Math.abs(mom);
    if (abs > bestAbs) {
      bestId = id;
      bestAbs = abs;
      bestMom = mom;
    }
  }

  if (bestId === null) return null;
  return { marketId: bestId, momentum: bestMom };
}

export function calcCascadeScore(leaderMomentum: number, followerMomentum: number): number {
  return leaderMomentum - followerMomentum;
}

export function isFollowerLagging(followerMomentum: number, lagMax: number): boolean {
  return Math.abs(followerMomentum) < lagMax;
}

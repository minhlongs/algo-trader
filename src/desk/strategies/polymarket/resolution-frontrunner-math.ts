/**
 * Resolution Frontrunner Strategy Math and Signal Helpers.
 */

export function isNearResolution(endDate: string, windowMs: number, now: number = Date.now()): boolean {
  const end = new Date(endDate).getTime();
  if (isNaN(end)) return false;
  const diff = end - now;
  return diff > 0 && diff <= windowMs;
}

export function detectConvergenceSignal(
  price: number,
  highThreshold: number,
  lowThreshold: number,
): 'buy-yes' | 'buy-no' | null {
  if (price > highThreshold) return 'buy-yes';
  if (price < lowThreshold) return 'buy-no';
  return null;
}

export function hasMomentum(priceHistory: number[], direction: 'up' | 'down', minTicks: number): boolean {
  if (priceHistory.length < minTicks) return false;
  const recent = priceHistory.slice(-minTicks);
  let consistentMoves = 0;
  for (let i = 1; i < recent.length; i++) {
    if (direction === 'up' && recent[i] >= recent[i - 1]) consistentMoves++;
    else if (direction === 'down' && recent[i] <= recent[i - 1]) consistentMoves++;
  }
  return consistentMoves >= Math.ceil((minTicks - 1) * 0.6);
}

/**
 * Listing Arbitrage Sniper — Math Helpers
 */

export function computeSpreadRatio(yesPrice: number, noPrice: number): number {
  return yesPrice + noPrice;
}

export function isSpreadWide(yesPrice: number, noPrice: number, threshold: number): boolean {
  return computeSpreadRatio(yesPrice, noPrice) < threshold;
}

export function isSpreadConverged(yesPrice: number, noPrice: number, threshold: number): boolean {
  return computeSpreadRatio(yesPrice, noPrice) > threshold;
}

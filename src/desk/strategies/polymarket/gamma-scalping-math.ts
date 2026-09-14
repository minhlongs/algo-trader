import { calcStdDev } from './strategy-math-helpers';

export function calcImpliedVol(prices: number[]): number {
  if (prices.length < 5) return 0.5;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1]! > 0) {
      returns.push(Math.log(prices[i]! / prices[i - 1]!));
    }
  }
  return calcStdDev(returns) * Math.sqrt(365);
}

export function calcTimeToExpiry(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (end <= now) return 0.001;
  return (end - now) / (365.25 * 24 * 60 * 60 * 1000);
}

export function estimateBinaryGamma(price: number, sigma: number, tte: number): number {
  if (sigma <= 0 || tte <= 0) return 0;

  const s = Math.max(0.001, Math.min(0.999, price));
  const d1 = (Math.log(s / (1 - s)) + (sigma * sigma / 2) * tte) / (sigma * Math.sqrt(tte));

  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);

  return nd1 / (s * (1 - s) * sigma * Math.sqrt(tte));
}

export function calcHedgeDirection(price: number, gamma: number): 'yes' | 'no' | null {
  if (gamma <= 0) return null;
  return price >= 0.5 ? 'no' : 'yes';
}

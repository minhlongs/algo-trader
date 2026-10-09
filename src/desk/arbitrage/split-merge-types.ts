/**
 * Split-Merge Arbitrage Types & Constants
 *
 * @module desk/arbitrage/split-merge-types
 */

export interface SplitMergeOpportunity {
  marketId: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  /** Combined cost of buying 1 YES + 1 NO share */
  totalCost: number;
  /** Profit per share after merge, minus 2% Polymarket fee */
  profit: number;
  profitPercent: number;
}

// Minimal shape from Gamma API response
export interface GammaMarket {
  conditionId?: string;
  question?: string;
  outcomePrices?: string | string[];
  active?: boolean;
  closed?: boolean;
  volume?: number | string;
}

export const GAMMA_MARKETS_URL = 'https://gamma-api.polymarket.com/markets?closed=false&limit=200';
export const POLY_FEE = 0.02;        // 2% fee applied at merge
export const FEE_THRESHOLD = 1 - POLY_FEE; // 0.98 — max total cost to remain profitable
export const MIN_PROFIT = 0.001;     // 0.1% minimum profit to surface opportunity
export const MIN_VOLUME = 5_000;     // minimum $5K volume for sufficient liquidity

export function parseOutcomePrices(raw: string | string[] | undefined): [number, number] | null {
  try {
    const arr: string[] = Array.isArray(raw) ? raw : JSON.parse(raw ?? '[]');
    const yes = parseFloat(arr[0] ?? '0');
    const no = parseFloat(arr[1] ?? '0');
    if (yes > 0 && yes < 1 && no > 0 && no < 1) return [yes, no];
  } catch { /* skip malformed */ }
  return null;
}

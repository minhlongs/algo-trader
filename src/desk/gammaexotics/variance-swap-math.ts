/**
 * Pure Strike-Weight & Log-Contract Integration Math for Variance and Gamma Swaps.
 */

import type { VanillaOptionQuote } from './variance-swap-types';

/**
 * Compute discrete strike spacing dK for option i in a sorted strike strip.
 */
export function computeStrikeStepDk(
  sortedQuotes: VanillaOptionQuote[],
  index: number,
): number {
  const K = sortedQuotes[index]!.strike;
  if (index === 0) {
    return sortedQuotes[1]!.strike - K;
  }
  if (index === sortedQuotes.length - 1) {
    return K - sortedQuotes[index - 1]!.strike;
  }
  return 0.5 * (sortedQuotes[index + 1]!.strike - sortedQuotes[index - 1]!.strike);
}

/**
 * Compute log-contract drift adjustment term (Demeterfi et al. 1999).
 */
export function computeLogContractDrift(
  S0: number,
  S_star: number,
  r: number,
  q: number,
  T: number,
): number {
  const F0 = S0 * Math.exp((r - q) * T);
  const forwardTerm = F0 / S_star - 1.0;
  const logRatio = Math.log(S_star / S0);
  return (2.0 / T) * ((r - q) * T - forwardTerm - logRatio);
}

/**
 * Integrate put and call option strips weighted by 1 / K^2.
 */
export function integrateVarianceOptionStrip(
  sortedQuotes: VanillaOptionQuote[],
  S_star: number,
  resolvePrice: (quote: VanillaOptionQuote) => number,
): { putIntegral: number; callIntegral: number } {
  let putIntegral = 0;
  let callIntegral = 0;

  for (let i = 0; i < sortedQuotes.length; i++) {
    const q_i = sortedQuotes[i]!;
    const K = q_i.strike;
    const dK = computeStrikeStepDk(sortedQuotes, i);
    const weight = (1.0 / (K * K)) * dK;
    const price = resolvePrice(q_i);

    if (K < S_star) {
      putIntegral += weight * price;
    } else if (K > S_star) {
      callIntegral += weight * price;
    } else {
      putIntegral += 0.5 * weight * price;
      callIntegral += 0.5 * weight * price;
    }
  }

  return { putIntegral, callIntegral };
}

/**
 * Integrate gamma swap option strip weighted by 2 / (S0 * K).
 */
export function integrateGammaOptionStrip(
  sortedQuotes: VanillaOptionQuote[],
  S0: number,
  resolvePrice: (quote: VanillaOptionQuote) => number,
): number {
  let gammaOptionIntegral = 0;
  for (let i = 0; i < sortedQuotes.length; i++) {
    const q_i = sortedQuotes[i]!;
    const K = q_i.strike;
    const dK = computeStrikeStepDk(sortedQuotes, i);
    const weight = (2.0 / (S0 * K)) * dK;
    gammaOptionIntegral += weight * resolvePrice(q_i);
  }
  return gammaOptionIntegral;
}

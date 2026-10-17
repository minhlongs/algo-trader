/**
 * Pure HJM curve, drift, forward rate evolution, and Monte Carlo math helpers.
 */

import type { HjmVolatilityFactor } from './hjm-types';

export function calculateNoArbitrageDrift(
  factors: HjmVolatilityFactor[],
  t: number,
  T: number,
): number {
  if (T <= t) return 0.0;
  let totalDrift = 0.0;
  for (const factor of factors) {
    totalDrift += factor.integrateDriftComponent(t, T);
  }
  return totalDrift;
}

export function sampleStandardNormalVariates(count: number): number[] {
  const variates: number[] = [];
  for (let i = 0; i < count; i++) {
    const u1 = Math.max(1e-12, Math.random());
    const u2 = Math.random();
    variates.push(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
  }
  return variates;
}

export function stepForwardRates(
  maturities: number[],
  currentForwardRates: number[],
  factors: HjmVolatilityFactor[],
  t: number,
  dt: number,
  sqrtDt: number,
  driftFn: (factors: HjmVolatilityFactor[], t: number, T: number) => number,
): number[] {
  const nextForwardRates: number[] = [];
  const zScores = sampleStandardNormalVariates(factors.length);

  for (let i = 0; i < maturities.length; i++) {
    const T = maturities[i]!;
    if (T < t) {
      nextForwardRates.push(currentForwardRates[i]!);
      continue;
    }

    const drift = driftFn(factors, t - dt, T);
    let diffusion = 0.0;
    for (let k = 0; k < factors.length; k++) {
      const sig = factors[k]!.evaluate(t - dt, T);
      diffusion += sig * zScores[k]! * sqrtDt;
    }

    const newF = currentForwardRates[i]! + drift * dt + diffusion;
    nextForwardRates.push(newF);
  }

  return nextForwardRates;
}

export function buildOptionTenorMaturities(bondMaturityYears: number): number[] {
  const tenorMaturities: number[] = [];
  for (let tau = 0.1; tau <= bondMaturityYears + 0.5; tau += 0.2) {
    tenorMaturities.push(Number(tau.toFixed(2)));
  }
  if (!tenorMaturities.includes(bondMaturityYears)) {
    tenorMaturities.push(bondMaturityYears);
  }
  tenorMaturities.sort((a, b) => a - b);
  return tenorMaturities;
}

export function computeMoneyMarketDiscountFactor(
  shortRates: number[],
  dt: number,
): number {
  let moneyMarketDiscount = 0.0;
  for (let i = 0; i < shortRates.length - 1; i++) {
    moneyMarketDiscount += shortRates[i]! * dt;
  }
  return Math.exp(-moneyMarketDiscount);
}

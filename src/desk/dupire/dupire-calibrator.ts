/**
 * Dupire (1994) Surface Calibrator & Arbitrage Detector.
 * Validates Breeden-Litzenberger density and calendar spread inequalities.
 * Strictly < 180 LOC, zero :any types.
 */

import {
  ArbitrageViolation,
  DupireMarketParams,
  LocalVolPoint,
} from './dupire-types';
import { computeDupireDerivatives } from './dupire-math';

export function evaluateLocalVolPoint(
  params: DupireMarketParams,
  callPriceFunc: (k: number, t: number) => number,
  strike: number,
  expiry: number,
  hK?: number,
  hT?: number
): { point: LocalVolPoint; violations: readonly ArbitrageViolation[] } {
  const violations: ArbitrageViolation[] = [];
  const deriv = computeDupireDerivatives(
    callPriceFunc,
    strike,
    expiry,
    params.riskFreeRate,
    params.dividendYield,
    hK,
    hT
  );

  // Breeden-Litzenberger risk neutral density: q(K) = exp(r * T) * (d^2 C / dK^2)
  const riskNeutralDensity = Math.exp(params.riskFreeRate * expiry) * deriv.d2CdK2;

  // Butterfly arbitrage condition: d^2 C / dK^2 must be non-negative
  if (deriv.d2CdK2 < 1e-12) {
    violations.push({
      strike,
      expiry,
      type: 'BUTTERFLY_DENSITY',
      message: `Negative or zero butterfly density detected: d2C/dK2 = ${deriv.d2CdK2.toFixed(6)}`,
      value: deriv.d2CdK2,
    });
  }

  // Calendar spread arbitrage condition: numerator must be non-negative
  if (deriv.numerator < -1e-10) {
    violations.push({
      strike,
      expiry,
      type: 'CALENDAR_SPREAD',
      message: `Calendar spread violation: numerator = ${deriv.numerator.toFixed(6)}`,
      value: deriv.numerator,
    });
  }

  let localVariance = 0;
  let hasArbitrage = violations.length > 0;

  if (deriv.denominator > 1e-12 && deriv.numerator >= 0) {
    localVariance = deriv.numerator / deriv.denominator;
  } else if (deriv.denominator > 1e-12 && deriv.numerator < 0) {
    localVariance = 0;
    violations.push({
      strike,
      expiry,
      type: 'NEGATIVE_VARIANCE',
      message: `Negative local variance numerator=${deriv.numerator.toFixed(6)} / den=${deriv.denominator.toFixed(6)}`,
      value: deriv.numerator / deriv.denominator,
    });
    hasArbitrage = true;
  } else {
    // Singular denominator fallback
    localVariance = 0;
  }

  // Bound local vol to prevent numerical infinity
  const localVol = Math.min(5.0, Math.sqrt(Math.max(0, localVariance)));

  const point: LocalVolPoint = {
    strike,
    expiry,
    localVol,
    localVariance,
    riskNeutralDensity,
    hasArbitrage,
  };

  return { point, violations };
}

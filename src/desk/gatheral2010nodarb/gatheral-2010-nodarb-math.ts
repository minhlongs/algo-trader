/**
 * Wave 282 — Gatheral (2010): No-Dynamic-Arbitrage and Market Impact
 * Verifies Gatheral's admissibility inequality delta + gamma >= 1 for f(v) = v^delta and G(tau) = tau^(-gamma).
 */
import type {
  Gatheral2010NoDarbConfig,
  Gatheral2010NoDarbResult,
} from './types';

export function evaluateGatheral2010NoDynamicArbitrage(
  cfg: Gatheral2010NoDarbConfig,
): Gatheral2010NoDarbResult {
  const {
    impactConcavityDelta: delta,
    kernelDecayGamma: gamma,
    roundTripVolumeV: V,
    impactScaleEta: eta,
  } = cfg;

  if (delta <= 0 || gamma <= 0 || gamma >= 1 || V <= 0 || eta <= 0) {
    throw new Error('Invalid Gatheral2010NoDarbConfig: exponents must satisfy delta > 0 and 0 < gamma < 1');
  }

  const exponentSum = delta + gamma;
  const admissible = exponentSum >= 1.0 - 1e-9;
  const isSqRoot = Math.abs(delta - 0.5) <= 0.05 && Math.abs(gamma - 0.5) <= 0.05;

  const kernelIntegral = 1 / ((1 - gamma) * (2 - gamma));
  const asymmetryFactor = exponentSum - 1.0;
  const roundTripCost = eta * Math.pow(V, 1 + delta) * kernelIntegral * (0.25 + 0.5 * asymmetryFactor);

  return {
    exponentSum,
    isNoDynamicArbitrageAdmissible: admissible,
    isSquareRootSpecialCase: isSqRoot,
    roundTripExpectedCost: roundTripCost,
    manipulationVulnerabilityFlag: !admissible || roundTripCost < 0,
  };
}

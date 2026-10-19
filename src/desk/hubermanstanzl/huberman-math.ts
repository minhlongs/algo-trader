/**
 * Wave 238: Huberman & Stanzl (2004) Mathematical Core
 * Evaluates round-trip expected revenue under linear permanent and temporary price impact.
 * Under permanent impact Lambda and temporary impact Eta, round-trip revenue is strictly <= 0
 * if and only if Lambda is positive semi-definite and symmetric (absence of quasi-arbitrage).
 */

import { QuasiArbitrageConfig, RoundTripStrategy, QuasiArbitrageAssessment } from './huberman-types';

export function evaluateQuasiArbitrage(
  strategy: RoundTripStrategy,
  config: QuasiArbitrageConfig
): QuasiArbitrageAssessment {
  const volumes = strategy.roundTripVolumes;
  const n = volumes.length;

  let netPosition = 0;
  let permanentRevenue = 0;
  let temporaryCost = 0;

  for (let i = 0; i < n; i++) {
    const v = volumes[i];
    // Next net position after current trade
    const newPosition = netPosition + v;
    // Execution price includes permanent impact of prior trades plus current trade
    const priceDriftCurrent = config.permanentImpactLambda * newPosition;
    // Execution cash flow: - v * priceDriftCurrent (v > 0: buying outflows cash, v < 0: selling inflows cash)
    permanentRevenue -= v * priceDriftCurrent;
    // Temporary execution dissipation cost: eta * v^2 / delta_t
    temporaryCost += (config.temporaryImpactEta * v * v) / strategy.timeStepDeltaT;
    netPosition = newPosition;
  }

  // Round trip implies final netPosition == 0
  const totalRevenue = permanentRevenue - temporaryCost;
  // Quasi-arbitrage exists if round-trip generates positive riskless revenue:
  const isQuasiArbitrageFree = totalRevenue <= 1e-9;

  return {
    totalExpectedRevenue: totalRevenue,
    isQuasiArbitrageFree,
    permanentPriceDrift: config.permanentImpactLambda * netPosition,
    temporaryImpactDissipationCost: temporaryCost,
  };
}

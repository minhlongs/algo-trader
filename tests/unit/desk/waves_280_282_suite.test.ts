import { describe, expect, it } from 'vitest';
import {
  Almgren2012StochasticLiq,
  CarteaJaimungal2016OrderFlow,
  Gatheral2010NoDarb,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 280-282 Suite', () => {
  it('Wave 280: Almgren (2012) optimal trading with stochastic mean-reverting liquidity', () => {
    const res = Almgren2012StochasticLiq.computeAlmgren2012StochasticLiquidity({
      initialInventoryQ0: 600,
      horizonSec: 60,
      steps: 6,
      meanTemporaryImpactEtaBar: 0.01,
      liquidityReversionKappa: 0.5,
      riskAversionLambda: 0.001,
      volatilitySigma: 0.2,
      realizedEtaPath: [0.005, 0.006, 0.012, 0.015, 0.008, 0.009, 0.01],
    });

    expect(res.trajectory).toHaveLength(7);
    // At step 0, eta_0 = 0.005 < etaBar = 0.01, so liquidity urgency factor > 1
    expect(res.trajectory[0].liquidityUrgencyFactor).toBeGreaterThan(1.0);
    // At step 3, eta_3 = 0.015 > etaBar = 0.01, so liquidity urgency factor < 1
    expect(res.trajectory[3].liquidityUrgencyFactor).toBeLessThan(1.0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
  });

  it('Wave 281: Cartea & Jaimungal (2016) order-flow incorporated optimal execution', () => {
    const sellIntoBuyingFlow = CarteaJaimungal2016OrderFlow.computeCartea2016OrderFlowExecution({
      currentInventory: 200,
      remainingTimeSec: 30,
      netOrderFlowMu: 15.0,
      orderFlowReversionKappa: 0.2,
      permanentImpactB: 0.002,
      temporaryImpactK: 0.01,
      runningInventoryPenaltyPhi: 0.001,
    });

    const sellIntoSellingFlow = CarteaJaimungal2016OrderFlow.computeCartea2016OrderFlowExecution({
      currentInventory: 200,
      remainingTimeSec: 30,
      netOrderFlowMu: -15.0,
      orderFlowReversionKappa: 0.2,
      permanentImpactB: 0.002,
      temporaryImpactK: 0.01,
      runningInventoryPenaltyPhi: 0.001,
    });

    // Net selling order flow (mu < 0) accelerates liquidation rate compared to net buying flow (mu > 0)
    expect(sellIntoSellingFlow.optimalExecutionRate).toBeGreaterThan(
      sellIntoBuyingFlow.optimalExecutionRate,
    );
  });

  it('Wave 282: Gatheral (2010) no-dynamic-arbitrage admissibility condition delta + gamma >= 1', () => {
    const admissibleSqRoot = Gatheral2010NoDarb.evaluateGatheral2010NoDynamicArbitrage({
      impactConcavityDelta: 0.5,
      kernelDecayGamma: 0.5,
      roundTripVolumeV: 1000,
      impactScaleEta: 0.01,
    });

    expect(admissibleSqRoot.exponentSum).toBeCloseTo(1.0, 6);
    expect(admissibleSqRoot.isNoDynamicArbitrageAdmissible).toBe(true);
    expect(admissibleSqRoot.isSquareRootSpecialCase).toBe(true);
    expect(admissibleSqRoot.manipulationVulnerabilityFlag).toBe(false);

    const vulnerableCase = Gatheral2010NoDarb.evaluateGatheral2010NoDynamicArbitrage({
      impactConcavityDelta: 0.3,
      kernelDecayGamma: 0.4,
      roundTripVolumeV: 1000,
      impactScaleEta: 0.01,
    });

    expect(vulnerableCase.isNoDynamicArbitrageAdmissible).toBe(false);
    expect(vulnerableCase.manipulationVulnerabilityFlag).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AlfonsiFruthSchied2010Shape,
  CarteaJaimungal2015StatArb,
  ContKukanovStoikov2014Ofi,
} from '../../../src/desk/index';

describe('Quantitative Desk Models Waves 283-285 Suite', () => {
  it('Wave 283: Alfonsi, Fruth & Schied (2010) U-shaped block execution under non-linear book shape', () => {
    const res = AlfonsiFruthSchied2010Shape.computeAlfonsi2010ShapeExecution({
      initialInventoryX0: 1000,
      horizonSec: 50,
      numIntermediateBlocksN: 5,
      resilienceRateRho: 0.1,
      bookDensityAlpha: 50,
      shapeExponentBeta: 0.8,
    });

    expect(res.blocks).toHaveLength(6);
    // U-shaped property: boundary blocks (index 0 and N) are strictly larger than interior blocks
    expect(res.blocks[0].tradeSize).toBeGreaterThan(res.blocks[1].tradeSize);
    expect(res.blocks[5].tradeSize).toBeCloseTo(res.blocks[0].tradeSize, 6);
    const sumSizes = res.blocks.reduce((acc, b) => acc + b.tradeSize, 0);
    expect(sumSizes).toBeCloseTo(1000, 6);
    expect(res.totalNonlinearImpactCost).toBeGreaterThan(0);
  });

  it('Wave 284: Cartea, Jaimungal & Penalva (2015) OU pairs trading statistical arbitrage', () => {
    const buyUnderpriced = CarteaJaimungal2015StatArb.computeCartea2015StatArbQuote({
      currentSpreadX: -0.5,
      equilibriumTheta: 0.0,
      meanReversionKappa: 0.25,
      currentInventoryQ: 0.0,
      temporaryImpactEta: 0.01,
      riskAversionPhi: 0.002,
      remainingHorizonSec: 60,
    });

    expect(buyUnderpriced.spreadMispricing).toBeCloseTo(0.5, 6);
    expect(buyUnderpriced.targetEquilibriumInventory).toBeGreaterThan(0);
    expect(buyUnderpriced.optimalTradingVelocityNu).toBeGreaterThan(0);
    expect(buyUnderpriced.expectedConvergenceHalfLifeSec).toBeCloseTo(Math.LN2 / 0.25, 5);
  });

  it('Wave 285: Cont, Kukanov & Stoikov (2014) L1 Order Flow Imbalance (OFI) and price impact', () => {
    const res = ContKukanovStoikov2014Ofi.computeContKukanovStoikov2014Ofi({
      snapshots: [
        { bidPrice: 100.0, bidSize: 200, askPrice: 100.1, askSize: 200 },
        { bidPrice: 100.0, bidSize: 350, askPrice: 100.1, askSize: 120 },
        { bidPrice: 100.1, bidSize: 180, askPrice: 100.2, askSize: 250 },
      ],
      baselineMarketDepthD: 500,
    });

    expect(res.steps).toHaveLength(2);
    // Step 1: bidSize +150, askSize -80 => e_1 = 150 - (-80) = +230
    expect(res.steps[0].eventContributionEn).toBeCloseTo(230, 5);
    expect(res.cumulativeOfi).toBeGreaterThan(0);
    expect(res.predictedMidPriceDelta).toBeGreaterThan(0);
  });
});

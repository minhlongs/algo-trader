import { describe, expect, it } from 'vitest';
import {
  GatheralRoughVol,
  CarteaCrossImpact,
  BouchaudFluctuation,
} from '../../../src/desk/index';

describe('Quantitative Desk Models (Waves 250 - 252)', () => {
  it('Wave 250: Gatheral, Jaisson & Rosenbaum (2018) Rough Fractional Volatility dynamics', () => {
    const config: GatheralRoughVol.GatheralRoughVolConfig = {
      hurstParameterH: 0.12, // rough volatility
      baseVolatilityXi0: 0.04, // 20% annualized vol squared
      volOfVolNu: 0.45,
      kernelComponents: [
        { weightOmega: 0.6, meanReversionTheta: 2.5 },
        { weightOmega: 0.4, meanReversionTheta: 15.0 },
      ],
    };

    const state = GatheralRoughVol.evaluateRoughVolatilityState(0.05, 0.2, config);
    expect(state.isSubdiffusive).toBe(true);
    expect(state.instantaneousVariance).toBeGreaterThan(0.001);
    expect(state.roughKernelValue).toBeGreaterThan(0.0);
    expect(state.fractionalDecayMetric).toBeGreaterThan(0.0);
  });

  it('Wave 251: Cartea & Jaimungal (2014) Multi-Asset Cross-Impact Liquidation Trajectory', () => {
    const inventories: CarteaCrossImpact.AssetInventoryState[] = [
      { assetId: 'BTC', initialSharesQ: 100, currentSharesQ: 80, tradingSpeedNu: 10 },
      { assetId: 'ETH', initialSharesQ: 1000, currentSharesQ: 750, tradingSpeedNu: 100 },
    ];

    const config: CarteaCrossImpact.CrossImpactLiquidationConfig = {
      riskAversionPhi: 1.2e-4,
      timeRemainingT: 3600, // 1 hour
      temporaryCrossImpactMatrix: [
        [0.05, 0.015],
        [0.015, 0.008],
      ],
      assetCovarianceMatrix: [
        [0.002, 0.0012],
        [0.0012, 0.003],
      ],
    };

    const trajectory = CarteaCrossImpact.computeCrossImpactLiquidation(inventories, config);
    expect(trajectory.optimalExecutionSpeedsNu).toHaveLength(2);
    expect(trajectory.optimalExecutionSpeedsNu[0]).toBeGreaterThan(0);
    expect(trajectory.optimalExecutionSpeedsNu[1]).toBeGreaterThan(0);
    expect(trajectory.instantExecutionCost).toBeGreaterThan(0);
    expect(trajectory.totalInventoryRiskPenalty).toBeGreaterThan(0);
  });

  it('Wave 252: Bouchaud, Farmer & Lillo (2009) Order Flow Fluctuation Dissipation Deconvolution', () => {
    const config: BouchaudFluctuation.BouchaudFluctuationConfig = {
      memoryDecayGamma: 0.6,
      baselineBareImpactG0: 1.2,
      lagPoints: [
        { lagL: 0, orderSignAutocorrelationC: 1.0, observedResponseR: 1.5 },
        { lagL: 1, orderSignAutocorrelationC: 0.7, observedResponseR: 1.8 },
        { lagL: 2, orderSignAutocorrelationC: 0.5, observedResponseR: 1.9 },
        { lagL: 3, orderSignAutocorrelationC: 0.38, observedResponseR: 1.95 },
      ],
    };

    const state = BouchaudFluctuation.computeFluctuationDissipation(config);
    expect(state.bareImpactKernelGamma).toHaveLength(4);
    expect(state.bareImpactKernelGamma[0]).toBeCloseTo(1.5, 4);
    expect(state.totalDissipatedEnergy).toBeGreaterThan(0);
    expect(state.subdiffusiveDiffusivityD).toBeGreaterThan(0);
  });
});

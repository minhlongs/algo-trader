import { describe, expect, it } from 'vitest';
import { KyleLambdaEngine } from '../../../../src/desk/kyle/kyle-lambda-engine';
import { KyleMarketParameters } from '../../../../src/desk/kyle/kyle-types';

describe('KyleLambdaEngine Suite', () => {
  const engine = new KyleLambdaEngine();

  const standardMarket: KyleMarketParameters = {
    fundamentalVarianceSigmaV2: 16.0,  // sigma_v = 4.0
    noiseOrderFlowVarianceSigmaU2: 10000.0, // sigma_u = 100.0
  };

  it('should compute Kyle equilibrium parameters accurately', () => {
    const eq = engine.computeEquilibrium(standardMarket);

    // lambda = 0.5 * sqrt(16 / 10000) = 0.5 * (4 / 100) = 0.5 * 0.04 = 0.02
    expect(eq.kyleLambda).toBeCloseTo(0.02, 5);
    // beta = sqrt(10000 / 16) = 100 / 4 = 25
    expect(eq.informedOrderBeta).toBeCloseTo(25.0, 4);
    // depth = 1 / 0.02 = 50
    expect(eq.marketLiquidityDepth).toBeCloseTo(50.0, 2);
    // Expected informed profit = 0.5 * sqrt(16 * 10000) = 0.5 * 400 = 200
    expect(eq.expectedInformedProfitUsd).toBeCloseTo(200.0, 2);
    expect(eq.priceEfficiencyPct).toBe(50.0);
  });

  it('should evaluate price impact and execution slippage for institutional buy order', () => {
    const p0 = 100.0;
    const orderFlow = 500; // 500 shares buy

    const execution = engine.evaluateOrderExecution(p0, orderFlow, standardMarket);

    // impact = 0.02 * 500 = 10.0 USD
    expect(execution.unperturbedPriceUsd).toBe(100.0);
    expect(execution.netOrderFlowShares).toBe(500);
    expect(execution.permanentPriceImpactUsd).toBe(10.0);
    expect(execution.executedPriceUsd).toBe(110.0);
    expect(execution.slippageBps).toBe(1000.0); // 10% = 1000 bps
  });

  it('should throw on non-positive variance inputs', () => {
    const invalid: KyleMarketParameters = {
      fundamentalVarianceSigmaV2: -1.0,
      noiseOrderFlowVarianceSigmaU2: 100.0,
    };

    expect(() => engine.computeEquilibrium(invalid)).toThrow(
      'Variances of fundamental value and noise flow must be positive'
    );
  });
});

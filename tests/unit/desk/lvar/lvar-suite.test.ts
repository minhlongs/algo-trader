import { describe, it, expect } from 'vitest';
import { BangiaLVaRCalculator } from '../../../../src/desk/lvar/bangia-lvar-calculator';
import { FrtbExpectedShortfallEngine } from '../../../../src/desk/lvar/frtb-expected-shortfall-engine';
import { ReturnSeriesInput, BidAskSpreadProfile } from '../../../../src/desk/lvar/lvar-types';

describe('Liquidity-Adjusted VaR & Basel FRTB Desk Suite', () => {
  const returns: number[] = [
    0.01, 0.005, -0.012, 0.008, -0.025, 0.003, -0.004, 0.015, -0.035, 0.002,
    -0.018, 0.006, -0.042, 0.011, -0.008, 0.007, -0.029, 0.014, -0.055, 0.001,
  ];

  const input: ReturnSeriesInput = {
    assetReturns: returns,
    portfolioValueUsd: 10000000, // $10M portfolio
    confidenceLevelPct: 97.5,
  };

  const spread: BidAskSpreadProfile = {
    meanSpreadBps: 15,
    spreadVolBps: 8,
  };

  describe('BangiaLVaRCalculator', () => {
    it('adds endogenous/exogenous spread penalty to standard VaR', () => {
      const calc = new BangiaLVaRCalculator();
      const res = calc.computeLVaR(input, spread);

      expect(res.standardVaRUsd).toBeGreaterThan(0);
      expect(res.exogenousSpreadCostUsd).toBeGreaterThan(0);
      expect(res.totalLiquidityAdjustedVaRUsd).toBe(res.standardVaRUsd + res.exogenousSpreadCostUsd);
      expect(res.liquidityAddOnPct).toBeGreaterThan(0);
    });
  });

  describe('FrtbExpectedShortfallEngine', () => {
    it('computes Basel Expected Shortfall with EVT fat-tail multiplier', () => {
      const engine = new FrtbExpectedShortfallEngine();
      const res = engine.computeFrtbExpectedShortfall(input, 0.20);

      expect(res.confidenceLevelPct).toBe(97.5);
      expect(res.valueAtRiskUsd).toBeGreaterThan(0);
      expect(res.expectedShortfallUsd).toBeGreaterThan(res.valueAtRiskUsd); // ES > VaR
      expect(res.tailSeverityMultiplier).toBeGreaterThan(1.0);
    });
  });
});

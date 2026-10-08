import { describe, expect, it } from 'vitest';
import { LelandEngine } from '../../../../src/desk/frictionhedging/leland-engine';
import { LelandParams, ReplicatingPosition } from '../../../../src/desk/frictionhedging/leland-types';

describe('Leland (1985) Option Pricing with Transaction Costs Suite (Desk 100)', () => {
  const baseParams: LelandParams = {
    spotPrice: 100,
    strikePrice: 100,
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    trueVolatility: 0.2, // 20%
    timeToMaturity: 1.0,
    transactionCost: 0.01, // 1% cost
    rebalanceInterval: 1.0 / 252.0, // Daily rebalancing
    position: ReplicatingPosition.SHORT_OPTION, // Hedging a short position (requires over-hedging)
    isCall: true,
  };

  it('should increase implied volatility for short option replication (costs amplify Gamma risk)', () => {
    const result = LelandEngine.calculateReplicationPrice(baseParams);
    expect(result.modifiedVolatility).toBeGreaterThan(baseParams.trueVolatility);
    expect(result.optionPrice).toBeGreaterThan(result.frictionlessPrice);
    expect(result.replicationPremium).toBeGreaterThan(0.0);
  });

  it('should decrease implied volatility for long option replication', () => {
    const longParams: LelandParams = {
      ...baseParams,
      position: ReplicatingPosition.LONG_OPTION, // Hedging a long position (earns from rebalancing)
    };
    const result = LelandEngine.calculateReplicationPrice(longParams);
    expect(result.modifiedVolatility).toBeLessThan(baseParams.trueVolatility);
    expect(result.optionPrice).toBeLessThan(result.frictionlessPrice);
    expect(result.replicationPremium).toBeLessThan(0.0);
  });

  it('should compute zero premium when transaction costs are zero (recovers frictionless BS)', () => {
    const zeroCostParams: LelandParams = {
      ...baseParams,
      transactionCost: 0.0,
    };
    const result = LelandEngine.calculateReplicationPrice(zeroCostParams);
    expect(result.modifiedVolatility).toBeCloseTo(baseParams.trueVolatility, 6);
    expect(result.replicationPremium).toBeCloseTo(0.0, 6);
    expect(result.optionPrice).toBeCloseTo(result.frictionlessPrice, 6);
  });

  it('should handle extreme transaction costs by capping variance at 0 for long replication', () => {
    const extremeParams: LelandParams = {
      ...baseParams,
      transactionCost: 0.5, // 50% spread -> ruins long replication completely
      position: ReplicatingPosition.LONG_OPTION,
    };
    const result = LelandEngine.calculateReplicationPrice(extremeParams);
    expect(result.modifiedVariance).toBeGreaterThan(0.0); // Bounded at 1e-12 locally
    expect(result.modifiedVolatility).toBeDefined();
    expect(result.optionPrice).toBeDefined();
  });
});

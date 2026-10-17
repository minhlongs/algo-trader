import { describe, expect, it } from 'vitest';
import { BertsimasLoEngine, BertsimasLoConfig } from '../../../../src/desk/bertsimaslo';

describe('BertsimasLoEngine (1998 Optimal Execution)', () => {
  const engine = new BertsimasLoEngine();

  it('reduces to uniform TWAP when no information state is present', () => {
    const config: BertsimasLoConfig = {
      initialShares: 1000,
      periods: 5,
      initialPrice: 100,
      permanentImpactCoeff: 0.001,
      temporaryImpactCoeff: 0.002,
      isBuy: true,
    };

    const result = engine.execute(config);

    expect(result.schedule.length).toBe(5);
    for (const step of result.schedule) {
      expect(step.tradeShares).toBeCloseTo(200, 3);
    }
    const totalSharesTraded = result.schedule.reduce((sum, s) => sum + s.tradeShares, 0);
    expect(totalSharesTraded).toBeCloseTo(1000, 3);
    expect(result.costSavingsVsTwapUsd).toBeCloseTo(0, 3);
  });

  it('demonstrates substantial cost savings over immediate single-block liquidation', () => {
    const config: BertsimasLoConfig = {
      initialShares: 5000,
      periods: 10,
      initialPrice: 50,
      permanentImpactCoeff: 0.002,
      temporaryImpactCoeff: 0.005,
      isBuy: true,
    };

    const result = engine.execute(config);

    expect(result.totalCashFlow).toBeLessThan(result.benchmarkImmediateCost);
    expect(result.costSavingsVsImmediateUsd).toBeGreaterThan(0);
    expect(result.averageExecutedPrice).toBeLessThan(result.benchmarkImmediateCost / 5000);
  });

  it('adapts trade schedule opportunistically when price momentum is present', () => {
    const config: BertsimasLoConfig = {
      initialShares: 1000,
      periods: 5,
      initialPrice: 100,
      permanentImpactCoeff: 0.001,
      temporaryImpactCoeff: 0.002,
      informationPersistence: 0.8,
      informationImpactCoeff: 0.5,
      initialInformationState: 1.0, // Upward price pressure
      isBuy: true,
    };

    const result = engine.execute(config);

    // When buying and price is drifting upwards, the algorithm should front-load purchases
    expect(result.schedule[0]!.tradeShares).toBeGreaterThan(200);
    const totalShares = result.schedule.reduce((sum, s) => sum + s.tradeShares, 0);
    expect(totalShares).toBeCloseTo(1000, 2);
  });

  it('correctly executes sell orders and generates positive revenue proceeds', () => {
    const config: BertsimasLoConfig = {
      initialShares: 2000,
      periods: 4,
      initialPrice: 150,
      permanentImpactCoeff: 0.001,
      temporaryImpactCoeff: 0.003,
      isBuy: false,
    };

    const result = engine.execute(config);

    expect(result.schedule.length).toBe(4);
    for (const step of result.schedule) {
      expect(step.tradeShares).toBeCloseTo(500, 2);
      expect(step.expectedExecutedPrice).toBeLessThan(150); // Downward price pressure when selling
    }
    expect(result.totalCashFlow).toBeGreaterThan(0);
  });

  it('throws descriptive validation errors on invalid inputs', () => {
    expect(() => engine.execute({
      initialShares: -100,
      periods: 5,
      initialPrice: 100,
      permanentImpactCoeff: 0.01,
      temporaryImpactCoeff: 0.01,
    })).toThrow('Initial shares must be strictly positive');

    expect(() => engine.execute({
      initialShares: 100,
      periods: 0,
      initialPrice: 100,
      permanentImpactCoeff: 0.01,
      temporaryImpactCoeff: 0.01,
    })).toThrow('Periods must be an integer >= 1');

    expect(() => engine.execute({
      initialShares: 100,
      periods: 5,
      initialPrice: 100,
      permanentImpactCoeff: 0.01,
      temporaryImpactCoeff: 0.01,
      informationPersistence: 1.2,
    })).toThrow('Information persistence rho must satisfy |rho| < 1');
  });
});

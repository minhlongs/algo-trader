import { describe, expect, it } from 'vitest';
import { GueantEngine } from '../../../../src/desk/gueant/gueant-engine';
import { GueantParams } from '../../../../src/desk/gueant/gueant-types';
import { GueantMath } from '../../../../src/desk/gueant/gueant-math';

describe('Guéant-Tapia-Manziadi (2012) Optimal Market Making Suite (Desk 119)', () => {
  const baseParams: GueantParams = {
    midPrice: 100.0,
    maxInventory: 3,            // q in [-3, 3] -> dimension 7
    currentInventory: 0,
    timeHorizon: 1.0,
    currentTime: 0.0,
    volatility: 0.02,
    riskAversion: 0.1,
    orderIntensityA: 1.5,
    orderSensitivityK: 1.5,
    terminalLiquidationPenalty: 0.5,
  };

  it('should quote symmetric bid and ask spreads at neutral inventory q = 0', () => {
    const result = GueantEngine.calculate(baseParams);

    expect(result.matrixDimension).toBe(7);
    expect(result.quotes).toHaveLength(7);

    const neutralQuote = result.currentQuote;
    expect(neutralQuote.inventory).toBe(0);
    expect(neutralQuote.optimalBidSpread).toBeCloseTo(neutralQuote.optimalAskSpread, 5);
    expect(neutralQuote.reservationPrice).toBeCloseTo(baseParams.midPrice, 5);
    expect(neutralQuote.optimalBid).toBeLessThan(baseParams.midPrice);
    expect(neutralQuote.optimalAsk).toBeGreaterThan(baseParams.midPrice);
    expect(neutralQuote.totalSpread).toBeGreaterThan(0.0);
  });

  it('should skew quotes aggressively downward when holding long inventory to liquidate risk', () => {
    const result = GueantEngine.calculate({
      ...baseParams,
      currentInventory: 2,
    });

    const longQuote = result.currentQuote;
    expect(longQuote.inventory).toBe(2);
    // Narrow ask spread to liquidate, widen bid spread to discourage accumulation
    expect(longQuote.optimalAskSpread).toBeLessThan(longQuote.optimalBidSpread);
    expect(longQuote.reservationPrice).toBeLessThan(baseParams.midPrice);
  });

  it('should skew quotes aggressively upward when holding short inventory to cover', () => {
    const result = GueantEngine.calculate({
      ...baseParams,
      currentInventory: -2,
    });

    const shortQuote = result.currentQuote;
    expect(shortQuote.inventory).toBe(-2);
    // Narrow bid spread to buy back, widen ask spread to discourage selling
    expect(shortQuote.optimalBidSpread).toBeLessThan(shortQuote.optimalAskSpread);
    expect(shortQuote.reservationPrice).toBeGreaterThan(baseParams.midPrice);
  });

  it('should compute matrix exponential correctly via scaling and squaring', () => {
    // Zero matrix -> Identity
    const zeroMat = [
      [0, 0],
      [0, 0],
    ];
    const expZero = GueantMath.matrixExponential(zeroMat);
    expect(expZero[0][0]).toBeCloseTo(1.0, 5);
    expect(expZero[0][1]).toBeCloseTo(0.0, 5);
    expect(expZero[1][1]).toBeCloseTo(1.0, 5);

    // Diagonal matrix -> exp(diag)
    const diagMat = [
      [1.0, 0.0],
      [0.0, 2.0],
    ];
    const expDiag = GueantMath.matrixExponential(diagMat);
    expect(expDiag[0][0]).toBeCloseTo(Math.exp(1.0), 5);
    expect(expDiag[1][1]).toBeCloseTo(Math.exp(2.0), 5);
  });

  it('should throw error for non-positive or invalid parameters', () => {
    expect(() => GueantEngine.calculate({ ...baseParams, midPrice: 0 })).toThrow(/must be strictly positive/i);
    expect(() => GueantEngine.calculate({ ...baseParams, maxInventory: 0 })).toThrow(/must be strictly positive/i);
    expect(() => GueantEngine.calculate({ ...baseParams, currentTime: 1.5, timeHorizon: 1.0 })).toThrow(/must be in \[0, T\)/i);
    expect(() => GueantEngine.calculate({ ...baseParams, terminalLiquidationPenalty: -0.1 })).toThrow(/non-negative/i);
  });
});

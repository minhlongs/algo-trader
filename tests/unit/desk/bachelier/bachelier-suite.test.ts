import { describe, expect, it } from 'vitest';
import { BachelierEngine } from '../../../../src/desk/bachelier/bachelier-engine';
import { BachelierModelParameters } from '../../../../src/desk/bachelier/bachelier-types';

describe('BachelierEngine Suite (Desk 80)', () => {
  const engine = new BachelierEngine();

  // Test parameters for standard asset / rate
  const standardParams: BachelierModelParameters = {
    forwardPrice: 100.0,
    strikePrice: 100.0,
    timeToExpiryYears: 1.0,
    normalVolatility: 15.0, // 15 USD / sqrt(year)
    riskFreeRatePct: 3.0,
  };

  it('should price ATM European call and put options and satisfy put-call parity', () => {
    const res = engine.priceOption(standardParams);

    expect(res.callPrice).toBeGreaterThan(0.0);
    expect(res.putPrice).toBeGreaterThan(0.0);
    expect(res.callDelta).toBeGreaterThan(0.0);
    expect(res.putDelta).toBeLessThan(0.0);
    expect(res.gamma).toBeGreaterThan(0.0);
    expect(res.vega).toBeGreaterThan(0.0);

    // Put-Call Parity: C - P = e^(-r*tau) * (F - K)
    const discount = Math.exp(-0.03 * 1.0);
    const expectedDiff = discount * (standardParams.forwardPrice - standardParams.strikePrice);
    const actualDiff = res.callPrice - res.putPrice;

    expect(Math.abs(actualDiff - expectedDiff)).toBeLessThan(0.01);
  });

  it('should price options under negative forward rates and strikes', () => {
    const negativeRateParams: BachelierModelParameters = {
      forwardPrice: -0.005,  // -50 bps negative rate
      strikePrice: -0.002,   // -20 bps negative strike
      timeToExpiryYears: 0.5,
      normalVolatility: 0.008, // 80 bps normal vol
      riskFreeRatePct: 0.0,
    };

    const res = engine.priceOption(negativeRateParams);

    expect(res.callPrice).toBeGreaterThan(0.0);
    expect(res.putPrice).toBeGreaterThan(0.0);
    // Forward < Strike => Call is OTM, Put is ITM
    expect(res.putPrice).toBeGreaterThan(res.callPrice);

    // Put-Call Parity in negative territory: C - P = F - K
    const actualDiff = res.callPrice - res.putPrice;
    const expectedDiff = negativeRateParams.forwardPrice - negativeRateParams.strikePrice;
    expect(Math.abs(actualDiff - expectedDiff)).toBeLessThan(0.0001);
  });

  it('should solve for implied normal volatility accurately via Newton-Raphson', () => {
    const trueVol = 18.5;
    const option = engine.priceOption({
      ...standardParams,
      normalVolatility: trueVol,
    });

    const impliedVol = engine.impliedNormalVolatility(
      option.callPrice,
      standardParams.forwardPrice,
      standardParams.strikePrice,
      standardParams.timeToExpiryYears,
      standardParams.riskFreeRatePct
    );

    expect(Math.abs(impliedVol - trueVol)).toBeLessThan(0.01);
  });

  it('should throw error when call price is below intrinsic value', () => {
    expect(() =>
      engine.impliedNormalVolatility(0.0, 100.0, 80.0, 1.0, 0.0)
    ).toThrow('Call price is below or equal to discounted intrinsic value');
  });
});

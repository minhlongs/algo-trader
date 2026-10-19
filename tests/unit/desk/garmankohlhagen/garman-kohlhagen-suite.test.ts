import { describe, it, expect } from 'vitest';
import { GarmanKohlhagenEngine } from '../../../../src/desk/garmankohlhagen/garman-kohlhagen-engine';
import { GarmanKohlhagenMath } from '../../../../src/desk/garmankohlhagen/garman-kohlhagen-math';
import { GarmanKohlhagenParams } from '../../../../src/desk/garmankohlhagen/garman-kohlhagen-types';

describe('Desk 120: Garman-Kohlhagen (1983) FX Options Engine', () => {
  const baseParams: GarmanKohlhagenParams = {
    spotRate: 1.10,          // EUR/USD spot
    strikeRate: 1.10,        // At-the-money strike
    timeToMaturity: 1.0,     // 1 year
    domesticRate: 0.05,      // USD risk-free rate 5%
    foreignRate: 0.03,       // EUR risk-free rate 3%
    volatility: 0.12,        // 12% annualized FX volatility
    optionType: 'call',
  };

  it('satisfies Garman-Kohlhagen Put-Call parity within analytical tolerance', () => {
    const callRes = GarmanKohlhagenEngine.evaluate({ ...baseParams, optionType: 'call' });
    const putRes = GarmanKohlhagenEngine.evaluate({ ...baseParams, optionType: 'put' });

    const lhs = callRes.price - putRes.price;
    const rhs =
      baseParams.spotRate * Math.exp(-baseParams.foreignRate * baseParams.timeToMaturity) -
      baseParams.strikeRate * Math.exp(-baseParams.domesticRate * baseParams.timeToMaturity);

    expect(Math.abs(lhs - rhs)).toBeLessThan(1e-10);
    expect(Math.abs(callRes.paritySpread)).toBeLessThan(1e-10);
  });

  it('verifies numerical sensitivity vs analytical Delta and Vega via finite difference', () => {
    const callRes = GarmanKohlhagenEngine.evaluate(baseParams);
    const epsS = 1e-5;
    const priceUpS = GarmanKohlhagenMath.calculatePrice(
      baseParams.spotRate + epsS,
      baseParams.strikeRate,
      baseParams.timeToMaturity,
      baseParams.domesticRate,
      baseParams.foreignRate,
      baseParams.volatility,
      'call'
    );
    const priceDownS = GarmanKohlhagenMath.calculatePrice(
      baseParams.spotRate - epsS,
      baseParams.strikeRate,
      baseParams.timeToMaturity,
      baseParams.domesticRate,
      baseParams.foreignRate,
      baseParams.volatility,
      'call'
    );
    const fdDelta = (priceUpS - priceDownS) / (2 * epsS);
    expect(Math.abs(callRes.greeks.delta - fdDelta)).toBeLessThan(1e-5);

    const epsVol = 1e-5;
    const priceUpVol = GarmanKohlhagenMath.calculatePrice(
      baseParams.spotRate,
      baseParams.strikeRate,
      baseParams.timeToMaturity,
      baseParams.domesticRate,
      baseParams.foreignRate,
      baseParams.volatility + epsVol,
      'call'
    );
    const priceDownVol = GarmanKohlhagenMath.calculatePrice(
      baseParams.spotRate,
      baseParams.strikeRate,
      baseParams.timeToMaturity,
      baseParams.domesticRate,
      baseParams.foreignRate,
      baseParams.volatility - epsVol,
      'call'
    );
    const fdVega = (priceUpVol - priceDownVol) / (2 * epsVol);
    expect(Math.abs(callRes.greeks.vega - fdVega)).toBeLessThan(1e-4);
  });

  it('inverts implied volatility accurately using Newton-Raphson', () => {
    const trueVol = 0.185;
    const callPrice = GarmanKohlhagenMath.calculatePrice(
      baseParams.spotRate,
      baseParams.strikeRate,
      baseParams.timeToMaturity,
      baseParams.domesticRate,
      baseParams.foreignRate,
      trueVol,
      'call'
    );

    const recoveredVol = GarmanKohlhagenEngine.calculateImpliedVolatility({
      spotRate: baseParams.spotRate,
      strikeRate: baseParams.strikeRate,
      timeToMaturity: baseParams.timeToMaturity,
      domesticRate: baseParams.domesticRate,
      foreignRate: baseParams.foreignRate,
      targetPrice: callPrice,
      optionType: 'call',
    });

    expect(Math.abs(recoveredVol - trueVol)).toBeLessThan(1e-6);
  });

  it('rejects invalid inputs with appropriate errors', () => {
    expect(() =>
      GarmanKohlhagenEngine.evaluate({ ...baseParams, spotRate: -1.0 })
    ).toThrow(/Spot rate must be positive/);
    expect(() =>
      GarmanKohlhagenEngine.evaluate({ ...baseParams, strikeRate: 0 })
    ).toThrow(/Strike rate must be positive/);
  });
});

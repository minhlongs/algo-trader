import { describe, it, expect } from 'vitest';
import { ReinerRubinsteinEngine } from '../../../../src/desk/reinerrubinstein/reinerrubinstein-engine.js';
import { ReinerRubinsteinParams } from '../../../../src/desk/reinerrubinstein/reinerrubinstein-types.js';

describe('Desk 171: Reiner-Rubinstein (1991) Single-Barrier European Option Engine', () => {
  const baseCallParams: ReinerRubinsteinParams = {
    spotPrice: 100,
    strikePrice: 100,
    barrierPrice: 90,
    timeToExpiry: 0.5,
    riskFreeRate: 0.05,
    volatility: 0.25,
    barrierType: 'down-and-out-call',
  };

  it('validates input parameters and throws on invalid inputs', () => {
    expect(() =>
      ReinerRubinsteinEngine.price({ ...baseCallParams, spotPrice: -10 })
    ).toThrow(/spotPrice must be positive/);
    expect(() =>
      ReinerRubinsteinEngine.price({ ...baseCallParams, strikePrice: 0 })
    ).toThrow(/strikePrice must be positive/);
    expect(() =>
      ReinerRubinsteinEngine.price({ ...baseCallParams, barrierPrice: -5 })
    ).toThrow(/barrierPrice must be positive/);
    expect(() =>
      ReinerRubinsteinEngine.price({ ...baseCallParams, timeToExpiry: 0 })
    ).toThrow(/timeToExpiry must be positive/);
    expect(() =>
      ReinerRubinsteinEngine.price({ ...baseCallParams, volatility: -0.1 })
    ).toThrow(/volatility must be positive/);
  });

  it('satisfies In-Out Parity for Call options: C_in + C_out = C_vanilla', () => {
    const outRes = ReinerRubinsteinEngine.price({
      ...baseCallParams,
      barrierType: 'down-and-out-call',
    });
    const inRes = ReinerRubinsteinEngine.price({
      ...baseCallParams,
      barrierType: 'down-and-in-call',
    });

    expect(outRes.optionPrice).toBeGreaterThan(0);
    expect(inRes.optionPrice).toBeGreaterThan(0);
    expect(outRes.optionPrice + inRes.optionPrice).toBeCloseTo(outRes.vanillaPrice, 4);
  });

  it('satisfies In-Out Parity for Put options: P_in + P_out = P_vanilla', () => {
    const putParams: ReinerRubinsteinParams = {
      spotPrice: 100,
      strikePrice: 100,
      barrierPrice: 110,
      timeToExpiry: 0.5,
      riskFreeRate: 0.05,
      volatility: 0.25,
      barrierType: 'up-and-out-put',
    };

    const outRes = ReinerRubinsteinEngine.price(putParams);
    const inRes = ReinerRubinsteinEngine.price({
      ...putParams,
      barrierType: 'up-and-in-put',
    });

    expect(outRes.optionPrice).toBeGreaterThan(0);
    expect(inRes.optionPrice).toBeGreaterThan(0);
    expect(outRes.optionPrice + inRes.optionPrice).toBeCloseTo(outRes.vanillaPrice, 4);
  });

  it('correctly prices all 8 barrier option types and computes analytical Greeks', () => {
    const types: ReinerRubinsteinParams['barrierType'][] = [
      'down-and-out-call',
      'down-and-in-call',
      'up-and-out-call',
      'up-and-in-call',
      'down-and-out-put',
      'down-and-in-put',
      'up-and-out-put',
      'up-and-in-put',
    ];

    for (const bType of types) {
      const isDown = bType.startsWith('down');
      const barrier = isDown ? 90 : 110;
      const res = ReinerRubinsteinEngine.price({
        spotPrice: 100,
        strikePrice: 100,
        barrierPrice: barrier,
        timeToExpiry: 0.5,
        riskFreeRate: 0.05,
        volatility: 0.25,
        barrierType: bType,
      });

      expect(res.optionPrice).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(res.greeks.delta)).toBe(true);
      expect(Number.isFinite(res.greeks.gamma)).toBe(true);
      expect(Number.isFinite(res.greeks.vega)).toBe(true);
      expect(Number.isFinite(res.greeks.theta)).toBe(true);
      expect(Number.isFinite(res.greeks.rho)).toBe(true);
    }
  });

  it('triggers immediate knock-out when barrier is hit initially', () => {
    const res = ReinerRubinsteinEngine.price({
      ...baseCallParams,
      spotPrice: 85, // below down barrier of 90
      rebate: 2.5,
      barrierType: 'down-and-out-call',
    });

    expect(res.barrierHit).toBe(true);
    expect(res.optionPrice).toBe(2.5);
  });
});

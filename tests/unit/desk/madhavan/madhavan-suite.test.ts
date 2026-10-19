import { describe, it, expect } from 'vitest';
import { MadhavanEngine } from '../../../../src/desk/madhavan/madhavan-engine';

describe('MadhavanEngine — Microstructure Price Formation & Information Asymmetry Suite', () => {
  it('identifies order processing friction under bid-ask bouncing trade flow', () => {
    const signs = [1, -1, 1, -1, 1, -1, 1, -1, 1, -1];
    const baseP = 100.0;
    const phi = 0.05;
    const prices = signs.map(x => baseP + phi * x);

    const res = MadhavanEngine.calculate({ prices, orderSigns: signs });

    expect(res.impliedFullSpread).toBeGreaterThan(0.0);
    expect(res.orderProcessingShare).toBeGreaterThan(0.5);
    expect(res.autocorrelationRho).toBeLessThan(0.0);
  });

  it('detects high adverse selection share when trades induce permanent price impact', () => {
    const signs = [1, 1, 1, 1, 1, -1, -1, -1, -1, -1];
    let p = 100.0;
    const prices: number[] = [];
    for (const s of signs) {
      p += s * 0.1;
      prices.push(p);
    }

    const res = MadhavanEngine.calculate({ prices, orderSigns: signs });

    expect(res.thetaInformationAsymmetry).toBeGreaterThan(0.0);
    expect(res.adverseSelectionShare).toBeGreaterThan(0.4);
    expect(res.autocorrelationRho).toBeGreaterThan(0.0);
  });

  it('guarantees additive decomposition between adverse selection and order processing shares', () => {
    const signs = [1, 1, -1, 1, -1, 1, 1, -1, 1, -1];
    const prices = [100.0, 100.2, 100.1, 100.3, 100.2, 100.4, 100.5, 100.3, 100.5, 100.4];

    const res = MadhavanEngine.calculate({ prices, orderSigns: signs });

    expect(res.adverseSelectionShare + res.orderProcessingShare).toBeCloseTo(1.0, 6);
    expect(res.impliedFullSpread).toBeCloseTo(res.impliedHalfSpread * 2.0, 6);
    expect(res.regressionR2).toBeGreaterThanOrEqual(0.0);
  });

  it('estimates positive trade autocorrelation under momentum / clustered trade flows', () => {
    const signs = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const prices = signs.map((_, i) => 100.0 + i * 0.05);

    const res = MadhavanEngine.calculate({ prices, orderSigns: signs });

    expect(res.autocorrelationRho).toBeGreaterThan(0.9);
  });

  it('throws descriptive error on invalid inputs', () => {
    expect(() =>
      MadhavanEngine.calculate({
        prices: [100, 101, 102],
        orderSigns: [1, 1, 1],
      })
    ).toThrow('prices and orderSigns must contain at least 5 trade observations');

    expect(() =>
      MadhavanEngine.calculate({
        prices: [100, 101, 102, 103, 104],
        orderSigns: [1, 1, 1, 1],
      })
    ).toThrow('prices and orderSigns arrays must have identical length');
  });
});

import { describe, expect, it } from 'vitest';
import { MrrEngine } from '../../../../src/desk/mrr/mrr-engine';
import { MrrObservation } from '../../../../src/desk/mrr/mrr-types';

describe('MrrEngine Suite (Desk 79)', () => {
  const engine = new MrrEngine();

  // Synthetic deterministic order flow with adverse selection and order processing frictions
  const generateMarketData = (n: number, trueTheta: number, truePhi: number): MrrObservation[] => {
    const data: MrrObservation[] = [];
    let state = 42;
    let price = 100.0;
    let prevTrade = 1;

    for (let t = 0; t < n; t++) {
      state = (state * 1664525 + 1013904223) % 4294967296;
      // Correlated order flow: persistence rho ~ 0.4
      const randVal = (state % 100) / 100.0;
      const trade = randVal < 0.65 ? prevTrade : -prevTrade;
      prevTrade = trade;

      // Price revision with asymmetric info + bid-ask bounce
      const publicShock = (((state >> 8) % 100) - 50) / 500.0;
      price += trueTheta * trade + truePhi * (trade - (data[t - 1]?.signedTrade ?? 0)) + publicShock;
      data.push({ price, signedTrade: trade });
    }
    return data;
  };

  it('should estimate MRR structural parameters and decompose bid-ask spread', () => {
    const data = generateMarketData(250, 0.05, 0.03);
    const result = engine.estimateModel(data);

    expect(result.sampleSize).toBe(250);
    expect(result.adverseSelectionTheta).toBeGreaterThanOrEqual(0.0);
    expect(result.orderProcessingPhi).toBeGreaterThanOrEqual(0.0);
    expect(result.impliedHalfSpread).toBeGreaterThan(0.0);
    expect(result.adverseSelectionSharePct).toBeGreaterThan(0.0);
    expect(result.orderProcessingSharePct).toBeGreaterThan(0.0);
    expect(Math.abs(result.adverseSelectionSharePct + result.orderProcessingSharePct - 100.0)).toBeLessThan(0.1);
    expect(result.tradeAutocorrelationRho).toBeGreaterThan(-1.0);
    expect(result.tradeAutocorrelationRho).toBeLessThan(1.0);
    expect(result.publicInformationVariance).toBeGreaterThan(0.0);
  });

  it('should throw when sample size is insufficient (< 15)', () => {
    const fewObs: MrrObservation[] = [
      { price: 100.1, signedTrade: 1 },
      { price: 100.0, signedTrade: -1 },
    ];
    expect(() => engine.estimateModel(fewObs)).toThrow('At least 15 observations required for MRR model estimation');
  });
});

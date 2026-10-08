import { describe, expect, it } from 'vitest';
import { VannaVolgaEngine } from '../../../../src/desk/vannavolga/vanna-volga-engine';

describe('Vanna-Volga (2006) FX Smile Interpolation (Desk 104)', () => {
  it('should recover ATM volatility when target strike equals ATM strike', () => {
    const market = {
      spotPrice: 1.1000,
      timeToMaturity: 0.5,
      domesticRate: 0.05,
      foreignRate: 0.02,
      volAtm: 0.10,
      vol25DeltaPut: 0.12,
      vol25DeltaCall: 0.11,
      strike25DeltaPut: 1.0500,
      strikeAtm: 1.1050, // slightly off-spot due to fwd drift
      strike25DeltaCall: 1.1600
    };
    
    const result = VannaVolgaEngine.interpolateVolatility(market, market.strikeAtm);
    
    // The ATM weight (weight2) should be 1.0, others 0.0
    expect(result.weight1).toBeCloseTo(0.0, 5);
    expect(result.weight2).toBeCloseTo(1.0, 5);
    expect(result.weight3).toBeCloseTo(0.0, 5);
    
    expect(result.interpolatedVol).toBeCloseTo(market.volAtm, 5);
  });

  it('should recover 25-Delta Put volatility when targeting exactly the put strike', () => {
    const market = {
      spotPrice: 1.1000,
      timeToMaturity: 0.5,
      domesticRate: 0.05,
      foreignRate: 0.02,
      volAtm: 0.10,
      vol25DeltaPut: 0.12,
      vol25DeltaCall: 0.11,
      strike25DeltaPut: 1.0500,
      strikeAtm: 1.1050,
      strike25DeltaCall: 1.1600
    };
    
    const result = VannaVolgaEngine.interpolateVolatility(market, market.strike25DeltaPut);
    
    expect(result.weight1).toBeCloseTo(1.0, 5);
    expect(result.weight2).toBeCloseTo(0.0, 5);
    expect(result.weight3).toBeCloseTo(0.0, 5);
    
    expect(result.interpolatedVol).toBeCloseTo(market.vol25DeltaPut, 5);
  });

  it('should interpolate a valid mid-point volatility capturing the smile effect', () => {
    const market = {
      spotPrice: 1.1000,
      timeToMaturity: 0.5,
      domesticRate: 0.05,
      foreignRate: 0.02,
      volAtm: 0.10,
      vol25DeltaPut: 0.12,
      vol25DeltaCall: 0.11,
      strike25DeltaPut: 1.0500,
      strikeAtm: 1.1050,
      strike25DeltaCall: 1.1600
    };
    
    // Strike halfway between Put and ATM
    const targetK = 1.0800;
    const result = VannaVolgaEngine.interpolateVolatility(market, targetK);
    
    // Interpolated vol should be firmly between Put vol and ATM vol
    expect(result.interpolatedVol).toBeGreaterThan(market.volAtm);
    expect(result.interpolatedVol).toBeLessThan(market.vol25DeltaPut);
  });
});

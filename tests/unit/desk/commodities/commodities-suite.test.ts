import { describe, it, expect } from 'vitest';
import { StorageConvenienceYieldEngine } from '../../../../src/desk/commodities/storage-convenience-yield-engine';
import { CalendarSpreadRollEngine } from '../../../../src/desk/commodities/calendar-spread-roll-engine';
import { SamuelsonVolatilityCurve } from '../../../../src/desk/commodities/samuelson-volatility-curve';
import { StorageParameters, CommodityContract } from '../../../../src/desk/commodities/commodities-types';

describe('Commodities Basis & Spreads Desk Suite', () => {
  const storage: StorageParameters = {
    spotPrice: 80.0, // $80/bbl
    financingRatePct: 5.0, // 5% risk free
    storageCostPct: 2.0, // 2% storage
  };

  describe('StorageConvenienceYieldEngine', () => {
    it('detects backwardation when futures price is discounted relative to cost-of-carry', () => {
      const engine = new StorageConvenienceYieldEngine();
      const contract: CommodityContract = {
        ticker: 'CL_M1',
        expiryYears: 0.25,
        futuresPrice: 78.5, // Discounted below $80 spot
      };

      const res = engine.evaluateConvenienceYield(contract, storage);

      expect(res.regime).toBe('BACKWARDATION');
      expect(res.impliedConvenienceYieldPct).toBeGreaterThan(7.0); // y > r + u (5 + 2 = 7)
      expect(res.theoreticalCostOfCarryPrice).toBeGreaterThan(80.0);
    });

    it('detects contango when futures price reflects storage carrying costs', () => {
      const engine = new StorageConvenienceYieldEngine();
      const contract: CommodityContract = {
        ticker: 'CL_M1',
        expiryYears: 0.25,
        futuresPrice: 81.3,
      };

      const res = engine.evaluateConvenienceYield(contract, storage);
      expect(res.regime).toBe('CONTANGO');
      expect(res.impliedConvenienceYieldPct).toBeLessThan(7.0);
    });
  });

  describe('CalendarSpreadRollEngine', () => {
    it('calculates positive roll yield in backwardation spread and flags cash-and-carry arb in steep contango', () => {
      const engine = new CalendarSpreadRollEngine();

      const nearContract: CommodityContract = { ticker: 'CL_M1', expiryYears: 0.25, futuresPrice: 82.0 };
      const farContract: CommodityContract = { ticker: 'CL_M2', expiryYears: 0.5, futuresPrice: 79.0 };

      const res = engine.evaluateSpread(nearContract, farContract, storage);

      expect(res.annualizedRollYieldPct).toBeGreaterThan(0); // Positive roll yield
      expect(res.spreadPrice).toBe(-3.0);
      expect(res.cashAndCarryArbAvailable).toBe(false);

      // Extreme contango scenario triggering cash-and-carry arb
      const steepFarContract: CommodityContract = { ticker: 'CL_M2_STEEP', expiryYears: 0.5, futuresPrice: 86.0 };
      const arbRes = engine.evaluateSpread(nearContract, steepFarContract, storage);
      expect(arbRes.cashAndCarryArbAvailable).toBe(true);
      expect(arbRes.arbProfitUsdPerUnit).toBeGreaterThan(0);
    });
  });

  describe('SamuelsonVolatilityCurve', () => {
    it('models volatility decay as maturity increases (Samuelson effect)', () => {
      const curve = new SamuelsonVolatilityCurve();
      const params = { baseVolPct: 40.0, decayAlpha: 0.8 };

      const nearVol = curve.evaluateVolatility(0.1, params); // Approaching expiry
      const farVol = curve.evaluateVolatility(1.0, params); // 1 year out

      expect(nearVol).toBeGreaterThan(farVol);
      expect(nearVol).toBeCloseTo(36.9, 0);
      expect(farVol).toBeCloseTo(17.9, 0);
    });
  });
});

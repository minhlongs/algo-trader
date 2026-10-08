import { describe, it, expect } from 'vitest';
import { BellmanFordTriangularArb } from '../../../../src/desk/fx/bellman-ford-triangular-arb';
import { CipBasisCalculator } from '../../../../src/desk/fx/cip-basis-calculator';
import { FxForwardSwapPricer } from '../../../../src/desk/fx/fx-forward-swap-pricer';
import { CurrencyRate } from '../../../../src/desk/fx/fx-types';

describe('Cross-Currency FX Triangulation Desk Suite', () => {
  describe('BellmanFordTriangularArb', () => {
    it('detects profitable cross-currency triangular cycle', () => {
      const arbEngine = new BellmanFordTriangularArb();

      // Synthetic arbitrage scenario:
      // EUR/USD = 1.0800
      // USD/JPY = 155.00
      // EUR/JPY direct cross = 168.00 (Synthetic = 1.0800 * 155.00 = 167.40, cross is overvalued at 168)
      // Buying USD -> EUR -> JPY -> USD yields profit
      const rates: CurrencyRate[] = [
        { baseCurrency: 'EUR', quoteCurrency: 'USD', bid: 1.0805, ask: 1.0807 },
        { baseCurrency: 'USD', quoteCurrency: 'JPY', bid: 155.1, ask: 155.15 },
        { baseCurrency: 'EUR', quoteCurrency: 'JPY', bid: 168.0, ask: 168.05 },
      ];

      const cycles = arbEngine.findTriangularArbitrage(rates, 4, 0.1);

      expect(cycles.length).toBeGreaterThan(0);
      const topCycle = cycles[0]!;
      expect(topCycle.multiplier).toBeGreaterThan(1.0);
      expect(topCycle.profitBps).toBeGreaterThan(0);
      expect(topCycle.path[0]).toBe(topCycle.path[topCycle.path.length - 1]);
    });

    it('returns empty list when market is in strict no-arbitrage equilibrium', () => {
      const arbEngine = new BellmanFordTriangularArb();

      // Fair rates with realistic wide bid/ask spreads that erase friction
      const rates: CurrencyRate[] = [
        { baseCurrency: 'EUR', quoteCurrency: 'USD', bid: 1.08, ask: 1.0805 },
        { baseCurrency: 'USD', quoteCurrency: 'JPY', bid: 155.0, ask: 155.1 },
        { baseCurrency: 'EUR', quoteCurrency: 'JPY', bid: 167.4, ask: 167.6 },
      ];

      const cycles = arbEngine.findTriangularArbitrage(rates, 4, 5.0); // 5 bps hurdle
      expect(cycles.length).toBe(0);
    });
  });

  describe('CipBasisCalculator', () => {
    it('computes CIP basis and determines arbitrage direction', () => {
      const calculator = new CipBasisCalculator();

      const result = calculator.evaluateCipBasis({
        spotRate: 1.085,
        forwardRate: 1.091,
        domesticRatePct: 5.25, // USD
        foreignRatePct: 3.75, // EUR
        tenorDays: 90,
      });

      expect(result.theoreticalForward).toBeGreaterThan(0);
      expect(typeof result.forwardPoints).toBe('number');
      expect(typeof result.cipBasisBps).toBe('number');
      expect(['BORROW_DOMESTIC_LEND_FOREIGN', 'BORROW_FOREIGN_LEND_DOMESTIC', 'EQUILIBRIUM']).toContain(
        result.arbitrageDirection
      );
    });

    it('throws error for invalid non-positive spot or tenor', () => {
      const calculator = new CipBasisCalculator();
      expect(() =>
        calculator.evaluateCipBasis({
          spotRate: -1,
          forwardRate: 1.08,
          domesticRatePct: 5,
          foreignRatePct: 3,
          tenorDays: 90,
        })
      ).toThrow('must be positive');
    });
  });

  describe('FxForwardSwapPricer', () => {
    it('constructs multi-tenor swap points and outright curves', () => {
      const pricer = new FxForwardSwapPricer();

      const tenors = [
        { name: '1M', days: 30 },
        { name: '3M', days: 90 },
        { name: '6M', days: 180 },
        { name: '1Y', days: 360 },
      ];

      const curve = pricer.generateSwapCurve(1.085, 1.0852, 5.25, 5.15, 3.75, 3.65, tenors);

      expect(curve.length).toBe(4);
      expect(curve[0]!.tenorName).toBe('1M');
      expect(curve[3]!.tenorName).toBe('1Y');
      expect(curve[3]!.outrightBid).toBeGreaterThan(curve[0]!.outrightBid);
    });
  });
});

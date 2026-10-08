import { describe, it, expect } from 'vitest';
import { CalendarArbitrageDetector } from '../../../../src/desk/volarb/calendar-arbitrage-detector';
import { ButterflySmileRepairer } from '../../../../src/desk/volarb/butterfly-smile-repairer';
import { CalendarSpreadPoint, SmilePoint } from '../../../../src/desk/volarb/volarb-types';

describe('Implied Volatility Arbitrage & Static Smile Repair Desk Suite', () => {
  describe('CalendarArbitrageDetector', () => {
    it('detects inverted calendar spread total variance violations', () => {
      const detector = new CalendarArbitrageDetector();
      const points: CalendarSpreadPoint[] = [
        { expiryYears: 0.25, totalVarianceW: 0.05 },
        { expiryYears: 0.50, totalVarianceW: 0.04 }, // Inversion! w decreases
        { expiryYears: 1.00, totalVarianceW: 0.08 },
      ];

      const violations = detector.detectCalendarArbitrage(points);
      expect(violations.length).toBe(1);
      expect(violations[0]!.type).toBe('CALENDAR_SPREAD');
      expect(violations[0]!.severityMetric).toBeCloseTo(0.01, 4);
    });

    it('returns empty violations when calendar spreads are monotonically increasing', () => {
      const detector = new CalendarArbitrageDetector();
      const points: CalendarSpreadPoint[] = [
        { expiryYears: 0.25, totalVarianceW: 0.04 },
        { expiryYears: 0.50, totalVarianceW: 0.06 },
        { expiryYears: 1.00, totalVarianceW: 0.09 },
      ];

      const violations = detector.detectCalendarArbitrage(points);
      expect(violations.length).toBe(0);
    });
  });

  describe('ButterflySmileRepairer', () => {
    it('detects negative density in butterfly spread and projects convex repair', () => {
      const repairer = new ButterflySmileRepairer();

      // Non-convex call price structure at strike 100:
      // K=90 -> C=15
      // K=100 -> C=14 (too high! violates convexity between 90 and 110)
      // K=110 -> C=5
      const points: SmilePoint[] = [
        { strike: 90, callPrice: 15.0, totalVarianceW: 0.04 },
        { strike: 100, callPrice: 14.0, totalVarianceW: 0.04 },
        { strike: 110, callPrice: 5.0, totalVarianceW: 0.04 },
      ];

      const res = repairer.repairSmile(points);

      expect(res.violationsFound.length).toBeGreaterThan(0);
      expect(res.violationsFound[0]!.type).toBe('BUTTERFLY_SPREAD_NEGATIVE_DENSITY');
      // Repaired call price at K=100 should be <= (15 + 5)/2 = 10.0
      expect(res.repairedPoints[1]!.callPrice).toBeLessThanOrEqual(10.0);
    });
  });
});

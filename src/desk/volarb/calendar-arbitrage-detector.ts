import { CalendarSpreadPoint, ArbitrageViolation } from './volarb-types';

export class CalendarArbitrageDetector {
  public detectCalendarArbitrage(points: CalendarSpreadPoint[]): ArbitrageViolation[] {
    const sorted = [...points].sort((a, b) => a.expiryYears - b.expiryYears);
    const violations: ArbitrageViolation[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;

      // Total variance w = sigma^2 * T must be non-decreasing in time T to prevent calendar arbitrage
      if (curr.totalVarianceW < prev.totalVarianceW) {
        const diff = prev.totalVarianceW - curr.totalVarianceW;
        violations.push({
          type: 'CALENDAR_SPREAD',
          locationDescription: `Expiry ${prev.expiryYears}y (w=${prev.totalVarianceW}) -> ${curr.expiryYears}y (w=${curr.totalVarianceW})`,
          severityMetric: Number(diff.toFixed(6)),
        });
      }
    }

    return violations;
  }
}

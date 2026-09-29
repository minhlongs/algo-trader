import { describe, it, expect } from 'vitest';
import { RoceCalculator } from '../../../src/desk/telemetry/roce-calculator';

describe('RoceCalculator', () => {
  it('computes period ROCE accurately', () => {
    const res = RoceCalculator.computeRoce(5000, 100000, 30);
    expect(res.roce).toBeCloseTo(0.05, 4);
  });

  it('annualizes ROCE based on elapsed days (365 / days)', () => {
    const res = RoceCalculator.computeRoce(5000, 100000, 30);
    expect(res.roceAnnualized).toBeCloseTo(0.05 * (365 / 30), 2);
  });

  it('handles 1-day elapsed scaling 365x', () => {
    const res = RoceCalculator.computeRoce(100, 10000, 1);
    expect(res.roceAnnualized).toBeCloseTo(0.01 * 365, 2);
  });

  it('handles 365-day elapsed matching period ROCE exactly', () => {
    const res = RoceCalculator.computeRoce(2000, 10000, 365);
    expect(res.roceAnnualized).toBeCloseTo(res.roce, 4);
  });

  it('handles zero capital employed returning 0 without division-by-zero error', () => {
    const res = RoceCalculator.computeRoce(100, 0);
    expect(res.roce).toBe(0);
    expect(res.roceAnnualized).toBe(0);
  });

  it('handles negative capital employed safely returning 0', () => {
    const res = RoceCalculator.computeRoce(500, -1000);
    expect(res.roce).toBe(0);
    expect(res.roceAnnualized).toBe(0);
  });

  it('handles negative PnL returning negative ROCE', () => {
    const res = RoceCalculator.computeRoce(-2000, 50000, 30);
    expect(res.roce).toBeCloseTo(-0.04, 4);
    expect(res.roceAnnualized).toBeLessThan(0);
  });

  it('generates a structured RoceReport object', () => {
    const report = RoceCalculator.generateReport({
      engineId: 'arbitrage',
      totalPnlUsd: 1200,
      capitalEmployedUsd: 20000,
      daysElapsed: 15,
    });
    expect(report.engineId).toBe('arbitrage');
    expect(report.roce).toBeCloseTo(0.06, 4);
    expect(report.roceAnnualized).toBeCloseTo(0.06 * (365 / 15), 2);
    expect(report.timestamp).toBeGreaterThan(0);
  });

  it('computes margin utilization and threshold breaches correctly', () => {
    const normal = RoceCalculator.computeMarginUtilization({
      marginUsedUsd: 5000,
      capitalBaseUsd: 20000,
    });
    expect(normal.marginUtilizationRatio).toBe(0.25);
    expect(normal.warningThresholdBreached).toBe(false);
    expect(normal.criticalThresholdBreached).toBe(false);

    const warning = RoceCalculator.computeMarginUtilization({
      marginUsedUsd: 15000,
      capitalBaseUsd: 20000,
    });
    expect(warning.marginUtilizationRatio).toBe(0.75);
    expect(warning.warningThresholdBreached).toBe(true);
    expect(warning.criticalThresholdBreached).toBe(false);

    const critical = RoceCalculator.computeMarginUtilization({
      marginUsedUsd: 19000,
      capitalBaseUsd: 20000,
    });
    expect(critical.marginUtilizationRatio).toBe(0.95);
    expect(critical.warningThresholdBreached).toBe(true);
    expect(critical.criticalThresholdBreached).toBe(true);
  });
});

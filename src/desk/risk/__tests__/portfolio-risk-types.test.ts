import { describe, expect, it } from 'vitest';
import {
  CircuitBreakerStateSchema,
  CircuitBreakerTierSchema,
  CVaRReportSchema,
  DEFAULT_VENUE_CAPS,
  GrossLeverageReportSchema,
  PositionRiskSchema,
  TailDivergenceResultSchema,
  VaRReportSchema,
  VenueExposureReportSchema,
} from '../portfolio-risk-types';

describe('portfolio-risk-types Schema Validations', () => {
  it('validates CircuitBreakerTierSchema valid and invalid values', () => {
    expect(CircuitBreakerTierSchema.parse('NORMAL')).toBe('NORMAL');
    expect(CircuitBreakerTierSchema.parse('ALERT')).toBe('ALERT');
    expect(CircuitBreakerTierSchema.parse('REDUCE')).toBe('REDUCE');
    expect(CircuitBreakerTierSchema.parse('HALT')).toBe('HALT');
    expect(CircuitBreakerTierSchema.parse('HARD_STOP')).toBe('HARD_STOP');
    expect(() => CircuitBreakerTierSchema.parse('INVALID')).toThrow();
  });

  it('validates CircuitBreakerStateSchema valid states and bounds', () => {
    const valid = {
      tier: 'ALERT',
      peakToTroughDrawdown: 0.07,
      meanCorrelation: 0.86,
      grossLeverage: 1.5,
      triggeredAt: Date.now(),
      reason: 'Drawdown alert',
    };
    expect(CircuitBreakerStateSchema.parse(valid)).toMatchObject(valid);
    expect(() =>
      CircuitBreakerStateSchema.parse({ ...valid, peakToTroughDrawdown: 1.5 })
    ).toThrow();
    expect(() =>
      CircuitBreakerStateSchema.parse({ ...valid, meanCorrelation: 2.0 })
    ).toThrow();
  });

  it('validates PositionRiskSchema valid positions and engine constraints', () => {
    const position = {
      symbol: 'BTC/USDT',
      engineId: 'arbitrage',
      venue: 'binance',
      notionalUsd: 15000,
      currentPrice: 65000,
      quantity: 0.23,
      side: 'BUY',
      delta: 1.0,
      unrealizedPnlUsd: 250,
      timestamp: Date.now(),
    };
    expect(PositionRiskSchema.parse(position)).toMatchObject(position);
    expect(() => PositionRiskSchema.parse({ ...position, engineId: 'unknown-engine' })).toThrow();
    expect(() => PositionRiskSchema.parse({ ...position, currentPrice: -10 })).toThrow();
  });

  it('validates VaRReportSchema and CVaRReportSchema', () => {
    const varReport = {
      parametricVaR: 1200,
      historicalVaR: 1450,
      confidence: 0.95,
      horizonDays: 1,
      portfolioNav: 100000,
      timestamp: Date.now(),
      calculationMethod: 'both' as const,
    };
    expect(VaRReportSchema.parse(varReport)).toMatchObject(varReport);

    const cvarReport = {
      parametricCVaR: 1600,
      historicalCVaR: 1950,
      confidence: 0.99,
      horizonDays: 1,
      portfolioNav: 100000,
      timestamp: Date.now(),
    };
    expect(CVaRReportSchema.parse(cvarReport)).toMatchObject(cvarReport);
  });

  it('validates GrossLeverageReportSchema and VenueExposureReportSchema', () => {
    const levReport = {
      totalGrossExposureUsd: 250000,
      totalNavUsd: 100000,
      grossLeverage: 2.5,
      maxAllowedLeverage: 3.0,
      isAllowed: true,
      netDirectionalExposureUsd: 30000,
      netLeverage: 0.3,
      maxNetLeverage: 1.0,
    };
    expect(GrossLeverageReportSchema.parse(levReport)).toMatchObject(levReport);

    const venueReport = {
      venueAllocations: { binance: 40000, polymarket_clob: 30000 },
      venueCaps: DEFAULT_VENUE_CAPS,
      venueRatios: { binance: 0.4, polymarket_clob: 0.3 },
      isCompliant: true,
      violations: [],
    };
    expect(VenueExposureReportSchema.parse(venueReport)).toMatchObject(venueReport);
  });

  it('validates TailDivergenceResultSchema', () => {
    const tailRes = {
      ratio: 1.65,
      isTailDivergent: true,
      parametricCVaR: 2000,
      historicalCVaR: 3300,
      threshold: 1.5,
      warningMessage: 'Fat tail detected',
    };
    expect(TailDivergenceResultSchema.parse(tailRes)).toMatchObject(tailRes);
  });
});

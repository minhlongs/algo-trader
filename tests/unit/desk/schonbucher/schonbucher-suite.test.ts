import { describe, it, expect } from 'vitest';
import { SchonbucherEngine } from '../../../../src/desk/schonbucher/schonbucher-engine';
import { SchonbucherParams } from '../../../../src/desk/schonbucher/schonbucher-types';

describe('Desk 127: Schönbucher (2000) Factor Credit Default Model', () => {
  const baseParams: SchonbucherParams = {
    obligors: [
      { name: 'Corp A', baseHazardRate: 0.02, factorLoading: 0.4, recoveryRate: 0.4, notional: 10_000_000 },
      { name: 'Corp B', baseHazardRate: 0.03, factorLoading: 0.5, recoveryRate: 0.4, notional: 10_000_000 },
      { name: 'Corp C', baseHazardRate: 0.015, factorLoading: 0.3, recoveryRate: 0.4, notional: 10_000_000 },
      { name: 'Corp D', baseHazardRate: 0.05, factorLoading: 0.6, recoveryRate: 0.4, notional: 10_000_000 },
    ],
    timeHorizon: 5.0,
    riskFreeRate: 0.04,
    tranches: [
      { name: 'Equity (0-3%)', attachment: 0.0, detachment: 0.03 },
      { name: 'Mezzanine (3-7%)', attachment: 0.03, detachment: 0.07 },
      { name: 'Senior (7-15%)', attachment: 0.07, detachment: 0.15 },
    ],
  };

  it('calculates portfolio expected loss and bounded loss fractions', () => {
    const res = SchonbucherEngine.evaluate(baseParams);

    expect(res.totalPortfolioNotional).toBe(40_000_000);
    expect(res.expectedPortfolioLoss).toBeGreaterThan(0.0);
    expect(res.expectedPortfolioLoss).toBeLessThan(res.totalPortfolioNotional);
    expect(res.expectedPortfolioLossFraction).toBeGreaterThan(0.0);
    expect(res.expectedPortfolioLossFraction).toBeLessThan(1.0);
  });

  it('exhibits strictly monotonic seniority in tranche credit spreads (Equity > Mezz > Senior)', () => {
    const res = SchonbucherEngine.evaluate(baseParams);

    const equity = res.tranches.find((t) => t.name.startsWith('Equity'))!;
    const mezz = res.tranches.find((t) => t.name.startsWith('Mezzanine'))!;
    const senior = res.tranches.find((t) => t.name.startsWith('Senior'))!;

    expect(equity.trancheSpreadBps).toBeGreaterThan(mezz.trancheSpreadBps);
    expect(mezz.trancheSpreadBps).toBeGreaterThan(senior.trancheSpreadBps);
    expect(senior.trancheSpreadBps).toBeGreaterThanOrEqual(0.0);
  });

  it('responds monotonically to systemic correlation increase', () => {
    const lowCorrParams: SchonbucherParams = {
      ...baseParams,
      obligors: baseParams.obligors.map((ob) => ({ ...ob, factorLoading: 0.05 })),
    };
    const highCorrParams: SchonbucherParams = {
      ...baseParams,
      obligors: baseParams.obligors.map((ob) => ({ ...ob, factorLoading: 0.85 })),
    };

    const lowRes = SchonbucherEngine.evaluate(lowCorrParams);
    const highRes = SchonbucherEngine.evaluate(highCorrParams);

    // Higher correlation increases tail risk (senior tranche risk)
    const lowSenior = lowRes.tranches.find((t) => t.name.startsWith('Senior'))!;
    const highSenior = highRes.tranches.find((t) => t.name.startsWith('Senior'))!;

    expect(highSenior.expectedLossAmount).toBeGreaterThan(lowSenior.expectedLossAmount);
  });

  it('throws validation error on invalid obligor or tranche configurations', () => {
    expect(() =>
      SchonbucherEngine.evaluate({ ...baseParams, obligors: [] })
    ).toThrow(/Obligors list cannot be empty/);

    expect(() =>
      SchonbucherEngine.evaluate({
        ...baseParams,
        tranches: [{ name: 'Bad', attachment: 0.1, detachment: 0.05 }],
      })
    ).toThrow(/Invalid tranche attachments/);

    expect(() =>
      SchonbucherEngine.evaluate({
        ...baseParams,
        obligors: [{ ...baseParams.obligors[0], factorLoading: 1.5 }],
      })
    ).toThrow(/Factor loading must be in/);
  });
});

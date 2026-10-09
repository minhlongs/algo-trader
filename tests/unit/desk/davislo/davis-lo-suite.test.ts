import { describe, it, expect } from 'vitest';
import { DavisLoEngine } from '../../../../src/desk/davislo/davis-lo-engine';
import { DavisLoParams } from '../../../../src/desk/davislo/davis-lo-types';

describe('Desk 130: Davis-Lo (2001) Contagion Credit Default Engine', () => {
  const baseParams: DavisLoParams = {
    numObligors: 20,
    baseHazardRate: 0.02,   // 2% annual autonomous hazard
    contagionHazard: 0.01,  // 1% contagion boost per default
    recoveryRate: 0.40,     // 40% recovery -> 60% LGD
    timeHorizon: 5.0,       // 5 years
    riskFreeRate: 0.03,     // 3% risk-free rate
    tranches: [
      { name: 'Equity', attachment: 0.0, detachment: 0.03 },
      { name: 'Mezzanine', attachment: 0.03, detachment: 0.10 },
      { name: 'Senior', attachment: 0.10, detachment: 1.00 },
    ],
  };

  it('conserves probability mass and produces non-negative default probabilities', () => {
    const res = DavisLoEngine.evaluate(baseParams);

    expect(res.defaultProbabilities.length).toBe(baseParams.numObligors + 1);
    const sumProbs = res.defaultProbabilities.reduce((acc, p) => acc + p, 0);
    expect(Math.abs(sumProbs - 1.0)).toBeLessThan(1e-5);

    for (const p of res.defaultProbabilities) {
      expect(p).toBeGreaterThanOrEqual(0.0);
      expect(p).toBeLessThanOrEqual(1.0);
    }
    expect(res.expectedDefaults).toBeGreaterThan(0.0);
    expect(res.expectedDefaults).toBeLessThan(baseParams.numObligors);
  });

  it('exhibits strict tranche seniority spread hierarchy: Equity > Mezzanine > Senior', () => {
    const res = DavisLoEngine.evaluate(baseParams);

    const equity = res.tranches.find((t) => t.name === 'Equity')!;
    const mezzanine = res.tranches.find((t) => t.name === 'Mezzanine')!;
    const senior = res.tranches.find((t) => t.name === 'Senior')!;

    expect(equity).toBeDefined();
    expect(mezzanine).toBeDefined();
    expect(senior).toBeDefined();

    expect(equity.trancheSpreadBps).toBeGreaterThan(mezzanine.trancheSpreadBps);
    expect(mezzanine.trancheSpreadBps).toBeGreaterThan(senior.trancheSpreadBps);
    expect(equity.expectedLossFraction).toBeGreaterThan(mezzanine.expectedLossFraction);
  });

  it('demonstrates contagion amplification when mu increases', () => {
    const zeroContagion = DavisLoEngine.evaluate({
      ...baseParams,
      contagionHazard: 0.0,
    });

    const highContagion = DavisLoEngine.evaluate({
      ...baseParams,
      contagionHazard: 0.03,
    });

    // Contagion shifts mass to catastrophic default tails
    expect(highContagion.expectedDefaults).toBeGreaterThan(
      zeroContagion.expectedDefaults
    );
    expect(highContagion.expectedPortfolioLoss).toBeGreaterThan(
      zeroContagion.expectedPortfolioLoss
    );

    // Senior tranche spread should be significantly higher under severe contagion
    const zeroSenior = zeroContagion.tranches.find((t) => t.name === 'Senior')!;
    const highSenior = highContagion.tranches.find((t) => t.name === 'Senior')!;
    expect(highSenior.trancheSpreadBps).toBeGreaterThan(zeroSenior.trancheSpreadBps);
  });

  it('validates bounds and rejects invalid inputs', () => {
    expect(() =>
      DavisLoEngine.evaluate({ ...baseParams, numObligors: 0 })
    ).toThrow(/Number of obligors must be a positive integer/);

    expect(() =>
      DavisLoEngine.evaluate({ ...baseParams, baseHazardRate: -0.01 })
    ).toThrow(/Base hazard rate cannot be negative/);

    expect(() =>
      DavisLoEngine.evaluate({ ...baseParams, recoveryRate: 1.05 })
    ).toThrow(/Recovery rate must be in \[0, 1\)/);

    expect(() =>
      DavisLoEngine.evaluate({
        ...baseParams,
        tranches: [{ name: 'Bad', attachment: 0.2, detachment: 0.1 }],
      })
    ).toThrow(/Invalid tranche attachments/);
  });
});

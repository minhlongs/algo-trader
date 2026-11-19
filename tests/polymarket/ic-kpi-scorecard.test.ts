import { describe, expect, it } from 'vitest';
import {
  evaluateICKpiScorecard,
  UNKNOWN_EMPIRICAL_LABEL,
  type FinalVerdictKey,
  type ICScorecardInput,
} from '../../src/desk/polymarket/ic-kpi-scorecard';

function passingMockInput(overrides: Partial<ICScorecardInput> = {}): ICScorecardInput {
  return {
    generatedAtIso: '2026-11-19T10:00:00.000Z',
    mode: 'sim',
    strategyClass: 'mm',
    samples: {
      recordedL2Days: 30,
      qualifyingMakerFills: 500,
      resolvedOosForecasts: 150,
    },
    netPnlBootstrapCiLowerPusd: 125.5,
    sortinoRatio: 2.6,
    deflatedSharpe: 1.85,
    maxDrawdownMtmPct: 2.1,
    profitFactor: 1.55,
    fillRateDivergencePct: 9.5,
    multiLegCompletionPct: 95.2,
    realizedSpread60sPlusRebateRewardBps: 21.4,
    bssOos: 0.041,
    ece: 0.022,
    weightedAvgLockupDays: 6.4,
    lockedCapitalPct: 18.0,
    stress15xSlippageNetPnlPusd: 180,
    stress15xCancelLatencyNetPnlPusd: 165,
    stressMinus50PctRewardsNetPnlPusd: 140,
    deployableCapacityPusd: 45_000,
    clusterWorstCaseLossNavPct: 1.9,
    ghostFillCount: 0,
    maxTokenDrift: 0,
    legalG12Approved: false,
    founderG13Approved: false,
    ...overrides,
  };
}

describe('evaluateICKpiScorecard', () => {
  it('fails closed to UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE when empirical floors are unmet', () => {
    const report = evaluateICKpiScorecard(
      passingMockInput({
        samples: { recordedL2Days: 0, qualifyingMakerFills: 0, resolvedOosForecasts: 0 },
        legalG12Approved: true,
        founderG13Approved: true,
      }),
    );

    expect(report.empiricalSampleGatePassed).toBe(false);
    expect(report.kpis).toHaveLength(11);
    for (const kpi of report.kpis) {
      expect(kpi.status).toBe('UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE');
      expect(kpi.label).toBe(UNKNOWN_EMPIRICAL_LABEL);
    }

    const expectedVerdicts: Record<FinalVerdictKey, string> = {
      ARCHITECTURE_PARITY: 'HOLD',
      L2_CAPTURE_READINESS: 'HOLD',
      '30_DAY_L2_DATA': 'INSUFFICIENT_DATA',
      MAKER_ALPHA: 'INSUFFICIENT_DATA',
      NEGRISK_ALPHA: 'INSUFFICIENT_DATA',
      MARKET_BLIND_ALPHA: 'INSUFFICIENT_DATA',
      ECONOMIC_G11: 'HOLD',
      LEGAL_G12: 'HOLD',
      FOUNDER_G13: 'HOLD',
      REAL_MONEY_TRADING: 'DISABLED',
    };
    expect(Object.keys(report.verdicts)).toHaveLength(10);
    expect(report.verdicts).toEqual(expectedVerdicts);
  });

  it('accepts Bailey/LdP deflatedSharpeProbability >= 0.95 for KPI #2', () => {
    const report = evaluateICKpiScorecard(
      passingMockInput({
        deflatedSharpe: undefined,
        deflatedSharpeProbability: 0.96,
        architectureParityPassed: true,
        l2CaptureReady: true,
      }),
    );
    expect(report.kpis[1].status).toBe('PASS');
    expect(report.verdicts.ARCHITECTURE_PARITY).toBe('PASS');
    expect(report.verdicts.L2_CAPTURE_READINESS).toBe('PASS');
  });

  it('fails closed if any single empirical floor is below threshold (L2<30, fills<500, or OOS<150)', () => {
    const cases = [
      { recordedL2Days: 29, qualifyingMakerFills: 600, resolvedOosForecasts: 200 },
      { recordedL2Days: 45, qualifyingMakerFills: 499, resolvedOosForecasts: 200 },
      { recordedL2Days: 45, qualifyingMakerFills: 600, resolvedOosForecasts: 149 },
    ];
    for (const samples of cases) {
      const report = evaluateICKpiScorecard(passingMockInput({ samples }));
      expect(report.empiricalSampleGatePassed).toBe(false);
      expect(report.verdicts.ECONOMIC_G11).toBe('HOLD');
      expect(report.verdicts.REAL_MONEY_TRADING).toBe('DISABLED');
      expect(report.kpis.every((k) => k.status === 'UNKNOWN_INSUFFICIENT_EMPIRICAL_SAMPLE')).toBe(true);
    }
  });

  it('passes all 11 KPIs with complete mock inputs and keeps REAL_MONEY_TRADING DISABLED until G12+G13 approved', () => {
    const report = evaluateICKpiScorecard(passingMockInput());
    expect(report.empiricalSampleGatePassed).toBe(true);
    expect(report.kpis.every((k) => k.status === 'PASS')).toBe(true);
    expect(report.verdicts['30_DAY_L2_DATA']).toBe('PASS');
    expect(report.verdicts.MAKER_ALPHA).toBe('PASS');
    expect(report.verdicts.NEGRISK_ALPHA).toBe('PASS');
    expect(report.verdicts.MARKET_BLIND_ALPHA).toBe('PASS');
    expect(report.verdicts.ECONOMIC_G11).toBe('GO');
    expect(report.verdicts.LEGAL_G12).toBe('HOLD');
    expect(report.verdicts.FOUNDER_G13).toBe('HOLD');
    expect(report.verdicts.REAL_MONEY_TRADING).toBe('DISABLED');

    const approved = evaluateICKpiScorecard(
      passingMockInput({ legalG12Approved: true, founderG13Approved: true }),
    );
    expect(approved.verdicts.LEGAL_G12).toBe('GO');
    expect(approved.verdicts.FOUNDER_G13).toBe('GO');
    expect(approved.verdicts.REAL_MONEY_TRADING).toBe('ENABLED');
  });

  it('enforces pilot drawdown (<2.5%), event profit factor (>=1.60), and ghost fill == 0 thresholds', () => {
    const report = evaluateICKpiScorecard(
      passingMockInput({
        mode: 'pilot',
        strategyClass: 'event',
        maxDrawdownMtmPct: 2.6,
        profitFactor: 1.5,
        ghostFillCount: 1,
      }),
    );

    expect(report.kpis[2]!.status).toBe('FAIL'); // KPI 3: pilot DD >= 2.5%
    expect(report.kpis[3]!.status).toBe('FAIL'); // KPI 4: event PF < 1.60
    expect(report.kpis[10]!.status).toBe('FAIL'); // KPI 11: ghost fill > 0
    expect(report.verdicts.ECONOMIC_G11).toBe('HOLD');
    expect(report.verdicts.REAL_MONEY_TRADING).toBe('DISABLED');
  });
});

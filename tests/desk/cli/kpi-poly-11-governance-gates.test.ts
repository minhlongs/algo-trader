import { describe, expect, it } from 'vitest';
import { evaluatePolymarketKpis } from '../../../src/desk/cli/kpi-poly-evaluators';
import {
  formatKpiEvaluationReport,
  summarizeOverallVerdict,
} from '../../../src/desk/cli/kpi-poly-formatter';
import type { KpiEvaluationInput } from '../../../src/desk/cli/kpi-poly-types';
import { buildAllGoKpiInput, buildValidProvenance } from './kpi-poly-fixtures';

describe('Polymarket 11 Governance KPIs Verdicts (GO / NO-GO / NOT ENOUGH DATA)', () => {
  it('computes GO across all 11 KPIs when all report thresholds are satisfied', () => {
    const input = buildAllGoKpiInput();
    const report = evaluatePolymarketKpis(input, () => new Date('2026-11-13T00:00:00.000Z'));

    expect(report.rows).toHaveLength(11);
    expect(report.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const row of report.rows) {
      expect(row.verdict, `KPI #${row.id} (${row.name}): ${row.reason}`).toBe('GO');
      expect(row.numericValue).not.toBeNull();
    }

    const table = formatKpiEvaluationReport(report);
    expect(table).toContain('OVERALL GATE: GO  (GO=11/11 | NO-GO=0/11 | NOT ENOUGH DATA=0/11)');
    expect(table).toContain('recorded-l2');
    expect(table).toContain('prices-history');
    expect(table).toContain('data-api-v2');
  });

  it('returns NOT ENOUGH DATA honestly when sample window or live fills are missing', () => {
    const sparse: KpiEvaluationInput = {
      provenance: buildValidProvenance(),
      performance: {
        initialNavPusd: 10_000,
        equityCurve: [{ timestamp: '2026-11-12T00:00:00.000Z', equity: 10_000 }],
        closedCycles: [],
        relayerAndApiCostPusd: 0,
        lockedCapitalAvgPusd: 0,
        observationSpanDays: 1,
        paperShadowDays: 0.01,
        mode: 'sim-90d',
        strategyClass: 'market-making',
        nTrials: 3,
        periodsPerYear: 365,
      },
      execution: {
        simMakerFillRate: 0.35,
        liveMakerFillRate: null,
        basketAttempts: 0,
        completeBaskets: 0,
        postOnlySubmitted: 0,
        postOnlyRejected: 0,
      },
      adverseSelection: { markouts: [] },
      calibration: { forecasts: [] },
      capital: { weightedAvgLockupDays: null, awaitingResolutionPct: null, lockedOver30dPct: null },
      stress: {
        baselineNetPnlPusd: null,
        stressed15xNetPnlPusd: null,
        plusHalfCentSlippageNetPnlPusd: null,
      },
      capacity: { deployableCapacityPusd: null },
      tailAndSettlement: {
        eventClusterLossPctNav: [],
        undetectedGhostFills: null,
        maxUnexplainedTokenDiscrepancy: null,
        onChainReconciled: false,
      },
    };

    const report = evaluatePolymarketKpis(sparse);
    expect(report.rows).toHaveLength(11);
    for (const row of report.rows) {
      expect(row.verdict, `KPI #${row.id}`).toBe('NOT ENOUGH DATA');
    }
    expect(summarizeOverallVerdict(report.rows.map((r) => r.verdict))).toBe('NOT ENOUGH DATA');
  });

  it('triggers NO-GO across all 11 KPIs when floor / risk / concentration gates fail', () => {
    const base = buildAllGoKpiInput();
    const flatLosses = Array.from({ length: 40 }, (_, i) => ({
      timestamp: new Date(1_760_000_000_000 + i * 86_400_000).toISOString(),
      equity: 10_000 - i * 18,
    }));
    const nogoInput: KpiEvaluationInput = {
      provenance: base.provenance,
      performance: {
        ...base.performance,
        equityCurve: flatLosses,
        closedCycles: [
          { eventClusterId: 'only-one-cluster', netPnlPusd: 150, feeAndSlippagePusd: 20, notionalPusd: 1_000 },
          { eventClusterId: 'loser-a', netPnlPusd: -80, feeAndSlippagePusd: 10, notionalPusd: 500 },
          { eventClusterId: 'loser-b', netPnlPusd: -40, feeAndSlippagePusd: 10, notionalPusd: 500 },
          { eventClusterId: 'loser-c', netPnlPusd: -10, feeAndSlippagePusd: 10, notionalPusd: 500 },
          { eventClusterId: 'loser-d', netPnlPusd: -5, feeAndSlippagePusd: 10, notionalPusd: 500 },
        ],
      },
      execution: {
        simMakerFillRate: 0.5,
        liveMakerFillRate: 0.2,
        basketAttempts: 20,
        completeBaskets: 14,
        postOnlySubmitted: 20,
        postOnlyRejected: 9,
      },
      adverseSelection: {
        markouts: Array.from({ length: 12 }, () => ({
          side: 'yes' as const,
          fillPrice: 0.55,
          midAt60s: 0.52,
          makerRebateBps: 2,
          liquidityRewardBps: 0,
        })),
      },
      calibration: {
        forecasts: Array.from({ length: 24 }, (_, idx) => ({
          modelProb: 0.5,
          marketProb: idx % 2 === 0 ? 0.9 : 0.1,
          outcome: (idx % 2 === 0 ? 1 : 0) as 0 | 1,
        })),
      },
      capital: { weightedAvgLockupDays: 22, awaitingResolutionPct: 35, lockedOver30dPct: 55 },
      stress: {
        baselineNetPnlPusd: 15,
        stressed15xNetPnlPusd: -25,
        plusHalfCentSlippageNetPnlPusd: -10,
      },
      capacity: { deployableCapacityPusd: 1_800 },
      tailAndSettlement: {
        eventClusterLossPctNav: [3.6],
        undetectedGhostFills: 1,
        maxUnexplainedTokenDiscrepancy: 2.5,
        onChainReconciled: true,
      },
    };

    const report = evaluatePolymarketKpis(nogoInput);
    for (const row of report.rows) {
      expect(row.verdict, `KPI #${row.id} (${row.name})`).toBe('NO-GO');
    }
    expect(summarizeOverallVerdict(report.rows.map((r) => r.verdict))).toBe('NO-GO');
  });
});

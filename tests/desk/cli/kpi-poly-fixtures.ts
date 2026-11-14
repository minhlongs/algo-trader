import type { GammaMarket } from '../../../src/desk/polymarket/gamma-client';
import {
  L2_SOURCE_PRICES_HISTORY,
  L2_SOURCE_RECORDED,
  makeDataApiV2TradeRow,
  makePricesHistoryRow,
} from '../../../src/desk/polymarket/l2/l2-source-labels';
import type { ReplayedBookStep } from '../../../src/desk/polymarket/l2/l2-replay';
import type {
  KpiCalibrationSample,
  KpiClosedCycle,
  KpiEvaluationInput,
  KpiMakerMarkoutSample,
} from '../../../src/desk/cli/kpi-poly-types';

export function buildSampleGammaMarket(): GammaMarket {
  return {
    id: 'mkt-1',
    question: 'Will macro rate cut occur before Q4 meeting?',
    conditionId: '0xcond1',
    slug: 'macro-rate-cut-q4',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.52', '0.48'],
    volume: 120_000,
    liquidity: 45_000,
    endDate: '2026-12-01T00:00:00Z',
    active: true,
    closed: false,
    tokens: [
      { token_id: 'tok-yes-1', outcome: 'Yes', price: 0.52 },
      { token_id: 'tok-no-1', outcome: 'No', price: 0.48 },
    ],
    yesTokenId: 'tok-yes-1',
    noTokenId: 'tok-no-1',
    yesPrice: 0.52,
  };
}

export function buildValidProvenance() {
  const step: ReplayedBookStep = {
    t: 1_762_000_000_000,
    source: L2_SOURCE_RECORDED,
    assetId: 'tok-yes-1',
    eventType: 'book',
    bids: [{ price: '0.51', size: '500' }],
    asks: [{ price: '0.53', size: '500' }],
    row: {
      t: 1_762_000_000_000,
      source: L2_SOURCE_RECORDED,
      assetId: 'tok-yes-1',
      eventType: 'book',
      bids: [{ price: '0.51', size: '500' }],
      asks: [{ price: '0.53', size: '500' }],
    },
  };
  return {
    snapshots: [
      {
        timestamp: '2026-11-12T00:00:00.000Z',
        source: L2_SOURCE_PRICES_HISTORY,
        markets: [
          {
            conditionId: '0xcond1',
            question: 'Will macro rate cut occur before Q4 meeting?',
            source: L2_SOURCE_PRICES_HISTORY,
            yesTokenId: 'tok-yes-1',
            noTokenId: 'tok-no-1',
            yesPrice: 0.52,
            volume: 120_000,
            liquidity: 45_000,
            closed: false,
            endDate: '2026-12-01T00:00:00Z',
          },
        ],
      },
    ],
    priceRows: [makePricesHistoryRow({ t: 1_762_000_000_000, tokenId: 'tok-yes-1', price: 0.52 })],
    tradeRows: [
      makeDataApiV2TradeRow({
        t: 1_762_000_000_000,
        conditionId: '0xcond1',
        tokenId: 'tok-yes-1',
        side: 'BUY',
        price: 0.52,
        size: 100,
      }),
    ],
    l2Steps: [step],
  };
}

export function buildAllGoKpiInput(): KpiEvaluationInput {
  const equityCurve: Array<{ timestamp: string; equity: number }> = [];
  let eq = 10_000;
  for (let i = 0; i <= 120; i++) {
    const stepGain = i % 7 === 0 ? -2.5 : 18 + (i % 5);
    eq += stepGain;
    equityCurve.push({
      timestamp: new Date(1_760_000_000_000 + i * 86_400_000).toISOString(),
      equity: eq,
    });
  }

  const closedCycles: KpiClosedCycle[] = [
    { eventClusterId: 'cluster-a', netPnlPusd: 320, feeAndSlippagePusd: 18, notionalPusd: 1_500 },
    { eventClusterId: 'cluster-b', netPnlPusd: 290, feeAndSlippagePusd: 15, notionalPusd: 1_400 },
    { eventClusterId: 'cluster-c', netPnlPusd: -110, feeAndSlippagePusd: 14, notionalPusd: 1_200 },
    { eventClusterId: 'cluster-d', netPnlPusd: 260, feeAndSlippagePusd: 16, notionalPusd: 1_300 },
    { eventClusterId: 'cluster-e', netPnlPusd: 240, feeAndSlippagePusd: 12, notionalPusd: 1_100 },
    { eventClusterId: 'cluster-f', netPnlPusd: -90, feeAndSlippagePusd: 10, notionalPusd: 1_000 },
  ];

  const markouts: KpiMakerMarkoutSample[] = Array.from({ length: 12 }, () => ({
    side: 'yes' as const,
    fillPrice: 0.50,
    midAt60s: 0.502,
    makerRebateBps: 4,
    liquidityRewardBps: 2,
  }));

  const forecasts: KpiCalibrationSample[] = Array.from({ length: 24 }, (_, idx) => {
    const outcome: 0 | 1 = idx % 2 === 0 ? 1 : 0;
    return {
      modelProb: outcome === 1 ? 0.985 : 0.015,
      marketProb: outcome === 1 ? 0.62 : 0.38,
      outcome,
    };
  });

  return {
    provenance: buildValidProvenance(),
    performance: {
      initialNavPusd: 10_000,
      equityCurve,
      closedCycles,
      relayerAndApiCostPusd: 12,
      lockedCapitalAvgPusd: 800,
      observationSpanDays: 120,
      paperShadowDays: 28,
      mode: 'sim-90d',
      strategyClass: 'market-making',
      nTrials: 3,
      periodsPerYear: 365,
    },
    execution: {
      simMakerFillRate: 0.42,
      liveMakerFillRate: 0.39,
      basketAttempts: 50,
      completeBaskets: 48,
      postOnlySubmitted: 100,
      postOnlyRejected: 12,
    },
    adverseSelection: { markouts },
    calibration: { forecasts },
    capital: { weightedAvgLockupDays: 4.5, awaitingResolutionPct: 12, lockedOver30dPct: 10 },
    stress: {
      baselineNetPnlPusd: 910,
      stressed15xNetPnlPusd: 640,
      plusHalfCentSlippageNetPnlPusd: 520,
    },
    capacity: { deployableCapacityPusd: 32_000 },
    tailAndSettlement: {
      eventClusterLossPctNav: [1.1, 0.9],
      undetectedGhostFills: 0,
      maxUnexplainedTokenDiscrepancy: 0.2,
      onChainReconciled: true,
    },
  };
}

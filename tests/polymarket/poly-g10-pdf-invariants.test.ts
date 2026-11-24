import { describe, expect, it, vi } from 'vitest';
import { calcQuadraticTakerFeeV2 } from '../../src/desk/execution/polymarket-clob-v2-fee-math';
import { evaluatePolymarketKpis } from '../../src/desk/cli/kpi-poly-evaluators';
import { KPI_THRESHOLDS } from '../../src/desk/cli/kpi-poly-types';
import { computeCanonicalEconomicPnL } from '../../src/desk/polymarket/economic-truth-pnl';
import { GnosisCtfSettlementRelayer } from '../../src/desk/polymarket/gnosis-ctf-settlement-relayer';
import {
  evaluateICKpiScorecard,
  type ICScorecardInput,
} from '../../src/desk/polymarket/ic-kpi-scorecard';
import {
  LogOddsAvellanedaStoikovMarketMaker,
  shouldMergePusd,
} from '../../src/desk/polymarket/log-odds-avellaneda-stoikov-mm';
import { runNineScenarioStressSuite } from '../../src/desk/polymarket/quant-stress-and-bootstrap';
import { settleOrRecordBundle } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-settlement';
import { BundleBook } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-state';
import { DEFAULT_CONFIG, STRATEGY_NAME } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-types';
import type { GammaEvent } from '../../src/desk/polymarket/gamma-client';
import type { OrderManager } from '../../src/desk/polymarket/order-manager';
import { buildAllGoKpiInput } from '../desk/cli/kpi-poly-fixtures';

function basePassingScorecard(overrides: Partial<ICScorecardInput> = {}): ICScorecardInput {
  return {
    generatedAtIso: '2026-11-23T00:00:00.000Z',
    mode: 'sim',
    strategyClass: 'mm',
    samples: { recordedL2Days: 30, qualifyingMakerFills: 500, resolvedOosForecasts: 150 },
    netPnlBootstrapCiLowerPusd: 100,
    paperShadowDays: 21,
    totalNetPnlPusd: 500,
    maxSingleClusterNetPnlPusd: 200,
    sortinoRatio: 2.5,
    deflatedSharpe: 1.8,
    deflatedSharpeProbability: 0.97,
    maxDrawdownMtmPct: 2.0,
    profitFactor: 1.5,
    fillRateDivergencePct: 10,
    multiLegCompletionPct: 95,
    postOnlyRejectedPct: 12,
    cancelLatencyP99Ms: 180,
    realizedSpread60sPlusRebateRewardBps: 20,
    bssOos: 0.03,
    ece: 0.02,
    weightedAvgLockupDays: 5,
    lockedCapitalPct: 15,
    lockedOver30dPct: 10,
    stress15xSlippageNetPnlPusd: 150,
    stress15xCancelLatencyNetPnlPusd: 120,
    stressMinus50PctRewardsNetPnlPusd: 110,
    stressPlusHalfTickNetPnlPusd: 90,
    deployableCapacityPusd: 35_000,
    clusterWorstCaseLossNavPct: 1.5,
    ghostFillCount: 0,
    maxTokenDrift: 0,
    ...overrides,
  };
}

describe('Governance & execution invariants', () => {
  it('refuses mock redemption in live mode on GnosisCtfSettlementRelayer', async () => {
    const relayer = new GnosisCtfSettlementRelayer('0xrelayer', 0, 'live');
    relayer.registerCondition({
      conditionId: '0xcond-live',
      outcomeSlotCount: 2,
      payoutNumerators: [1, 0],
      payoutDenominator: 1,
      isResolved: true,
    });
    const onSuccess = vi.fn();
    relayer.on('redemptionSuccess', onSuccess);

    await expect(
      relayer.executeRedemption({ conditionId: '0xcond-live', indexSet: 1, shares: 50 }),
    ).rejects.toThrow(/live mode is disabled/i);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('enforces 500 maker markout fills and 150 OOS calibration forecasts in CLI KPI evaluators', () => {
    expect(KPI_THRESHOLDS.MIN_MAKER_MARKOUT_SAMPLES).toBe(500);
    expect(KPI_THRESHOLDS.MIN_CALIBRATION_FORECASTS).toBe(150);

    const base = buildAllGoKpiInput();
    const belowFloor = evaluatePolymarketKpis({
      ...base,
      adverseSelection: { markouts: base.adverseSelection.markouts.slice(0, 499) },
      calibration: { forecasts: base.calibration.forecasts.slice(0, 149) },
    });

    expect(belowFloor.rows[5]!.verdict).toBe('NOT ENOUGH DATA');
    expect(belowFloor.rows[6]!.verdict).toBe('NOT ENOUGH DATA');
  });

  it('fails closed on all 7 scorecard NO-GO triggers (concentration, shadow days, DSR/NaN, post-only, cancel p99, >30d lockup, +0.5c shock)', () => {
    const baseline = evaluateICKpiScorecard(basePassingScorecard());
    expect(baseline.kpis.every((k) => k.status === 'PASS')).toBe(true);

    const concentrated = evaluateICKpiScorecard(
      basePassingScorecard({ totalNetPnlPusd: 200, maxSingleClusterNetPnlPusd: 200 }),
    );
    expect(concentrated.kpis[0]!.status).toBe('FAIL');

    const shortShadow = evaluateICKpiScorecard(basePassingScorecard({ paperShadowDays: 20 }));
    expect(shortShadow.kpis[0]!.status).toBe('FAIL');

    const lowDsrHighProb = evaluateICKpiScorecard(
      basePassingScorecard({ deflatedSharpe: 0.9, deflatedSharpeProbability: 0.99 }),
    );
    expect(lowDsrHighProb.kpis[1]!.status).toBe('FAIL');

    const nanDsrHighProb = evaluateICKpiScorecard(
      basePassingScorecard({ deflatedSharpe: Number.NaN, deflatedSharpeProbability: 0.99 }),
    );
    expect(nanDsrHighProb.kpis[1]!.status).toBe('FAIL');

    const highReject = evaluateICKpiScorecard(basePassingScorecard({ postOnlyRejectedPct: 31 }));
    expect(highReject.kpis[4]!.status).toBe('FAIL');

    const slowCancel = evaluateICKpiScorecard(basePassingScorecard({ cancelLatencyP99Ms: 251 }));
    expect(slowCancel.kpis[4]!.status).toBe('FAIL');

    const longLockup = evaluateICKpiScorecard(basePassingScorecard({ lockedOver30dPct: 41 }));
    expect(longLockup.kpis[7]!.status).toBe('FAIL');

    const halfTickNeg = evaluateICKpiScorecard(
      basePassingScorecard({ stressPlusHalfTickNetPnlPusd: -0.01 }),
    );
    expect(halfTickNeg.kpis[8]!.status).toBe('FAIL');
  });

  it('computes drawdown/tail risk-adjusted return and compound annualized ROC with 4.5%/yr carry + UMA lockup', () => {
    const res = computeCanonicalEconomicPnL({
      initialCapitalPusd: 10_000,
      pusdBalance: 8_200,
      executableBidValuePusd: 2_100,
      grossClosedTradingPnlPusd: 400,
      grossSettledPnlPusd: 100,
      makerRebatesPusd: 20,
      liquidityRewardsPusd: 30,
      realizedFeesPusd: 40,
      estimatedFeesPusd: 10,
      slippagePusd: 15,
      relayerGasPusd: 5,
      inferenceCostPusd: 5,
      infraCostPusd: 25,
      lockedCapitalPusd: 2_000,
      weightedAvgLockupDays: 10,
      umaDisputeLockupDays: 5,
      maxDrawdownPct: 4.0,
      tailLossNavPct: 6.0,
    });

    expect(res.effectiveLockupDays).toBe(15);
    expect(res.costs.opportunityCostPusd).toBeCloseTo((2_000 * 0.045 * 10) / 365, 4);
    expect(res.costs.umaDisputeLockupCostPusd).toBeCloseTo((2_000 * 0.045 * 5) / 365, 4);
    expect(res.riskAdjustedCapitalReturnPct).toBeLessThan(res.capitalAdjustedReturnPct);
    expect(res.riskAdjustedCapitalReturnPct).toBeCloseTo(
      res.capitalAdjustedReturnPct / 1.06,
      3,
    );
    expect(res.compoundAnnualizedRocPct).toBeGreaterThan(res.returnOnCapitalTiedUpPct);

    // Guard against Infinity overflow when effectiveLockupDays is very small with high edge
    const extreme = computeCanonicalEconomicPnL({
      initialCapitalPusd: 10_000,
      pusdBalance: 10_000,
      executableBidValuePusd: 0,
      grossClosedTradingPnlPusd: 900,
      grossSettledPnlPusd: 0,
      makerRebatesPusd: 0,
      liquidityRewardsPusd: 0,
      realizedFeesPusd: 0,
      estimatedFeesPusd: 0,
      slippagePusd: 0,
      relayerGasPusd: 0,
      inferenceCostPusd: 0,
      infraCostPusd: 0,
      lockedCapitalPusd: 1_000,
      weightedAvgLockupDays: 0.1,
      umaDisputeLockupDays: 0,
    });
    expect(Number.isFinite(extreme.compoundAnnualizedRocPct)).toBe(true);
    expect(extreme.compoundAnnualizedRocPct).toBe(extreme.returnOnCapitalTiedUpPct);
  });

  it('rounds CLOB V2 quadratic taker fees to 5 decimals with a 0.00001 pUSD floor and NaN safety', () => {
    // Tiny notional below 0.00001 pUSD floor collapses to 0
    expect(calcQuadraticTakerFeeV2('crypto', 0.001, 0.01, false)).toBe(0);
    // NaN contracts fail safe to 0
    expect(calcQuadraticTakerFeeV2('crypto', 0.5, Number.NaN, false)).toBe(0);
    // Non-trivial notional rounds to 5 decimals
    const fee = calcQuadraticTakerFeeV2('crypto', 0.37, 13, false);
    const expected = Math.round(13 * 0.07 * 0.37 * 0.63 * 100_000) / 100_000;
    expect(fee).toBe(expected);
  });

  it('guarantees combined BUY-YES + BUY-NO cost < 1.00 pUSD and enforces 20 pUSD merge threshold', () => {
    const mm = new LogOddsAvellanedaStoikovMarketMaker({ tickSizeMicro: 1_000 });
    for (const mid of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const q = mm.quotePair({
        midProbability: mid,
        yangZhangVarianceDaily: 0.04,
        inventoryShares: 0,
        ofiNormalized: 0,
        currentVpin: 0.2,
      });
      expect(q.buyYesPriceMicro).toBe(q.bidPriceMicro);
      expect(q.buyNoPriceMicro).toBe(1_000_000 - q.askPriceMicro);
      expect(q.combinedPairCostMicro).toBeLessThan(1_000_000);
    }

    expect(shouldMergePusd(19.99, 25)).toBe(false);
    expect(shouldMergePusd(20, 20)).toBe(true);
    expect(shouldMergePusd(35, 22)).toBe(true);
    expect(shouldMergePusd(Number.NaN, 25)).toBe(false);
  });

  it('fails closed in NegRisk settlement when requirePreflight is true and ctfPreflight is omitted', async () => {
    const book = new BundleBook();
    const nowMs = 1_760_000_000_000;
    book.open(
      {
        eventId: 'evt-1',
        eventTitle: 'Test NegRisk',
        legs: [
          { conditionId: 'c1', tokenId: 't1', outcome: 'A', askPrice: 0.45, liquidityUsd: 500, targetShares: 10 },
          { conditionId: 'c2', tokenId: 't2', outcome: 'B', askPrice: 0.45, liquidityUsd: 500, targetShares: 10 },
        ],
        sumAsk: 0.9,
        grossEdgePusd: 0.1,
        netEdgePusd: 0.08,
        netEdgeBps: 800,
        conversionVaultFeePusd: 0.01,
        targetShares: 10,
        estimatedCapitalPusd: 9,
      },
      nowMs,
    );
    book.recordFill('evt-1', {
      orderId: 'o1',
      conditionId: 'c1',
      tokenId: 't1',
      outcome: 'A',
      price: 0.45,
      quantity: 10,
      fees: '0',
      aggressive: false,
      atMs: nowMs,
    });
    book.recordFill('evt-1', {
      orderId: 'o2',
      conditionId: 'c2',
      tokenId: 't2',
      outcome: 'B',
      price: 0.45,
      quantity: 10,
      fees: '0',
      aggressive: true,
      atMs: nowMs,
    });

    const settleSpy = vi.fn();
    const stats = { preflightPassed: 0, preflightBlocked: 0, excludedFiveMinuteEvents: 0 };
    const positions: Parameters<typeof settleOrRecordBundle>[0]['positions'] = [];
    const event = {
      id: 'evt-1',
      title: 'Test NegRisk',
      slug: 'test-negrisk',
      markets: [],
    } as unknown as GammaEvent;

    await settleOrRecordBundle({
      event,
      nowMs,
      totalOutcomeCount: 2,
      book,
      cfg: DEFAULT_CONFIG,
      orderManager: { settleBundleConversion: settleSpy } as unknown as OrderManager,
      strategyName: STRATEGY_NAME,
      positions,
      emitTrade: () => {},
      requirePreflight: true,
      stats,
    });

    expect(stats.preflightBlocked).toBe(1);
    expect(stats.preflightPassed).toBe(0);
    expect(settleSpy).not.toHaveBeenCalled();
    expect(book.isKilled('evt-1')).toBe(true);
    expect(book.basketTelemetry.complete).toBe(0);
    expect(positions.length).toBe(2);
  });

  it('permits offline NegRisk bundle settlement when requirePreflight is true and ctfPreflight passes', async () => {
    const book = new BundleBook();
    const nowMs = 1_760_000_000_000;
    book.open(
      {
        eventId: 'evt-ok',
        eventTitle: 'Test NegRisk Valid Preflight',
        legs: [
          { conditionId: 'c1', tokenId: 't1', outcome: 'A', askPrice: 0.45, liquidityUsd: 500, targetShares: 10 },
          { conditionId: 'c2', tokenId: 't2', outcome: 'B', askPrice: 0.45, liquidityUsd: 500, targetShares: 10 },
        ],
        sumAsk: 0.9,
        grossEdgePusd: 0.1,
        netEdgePusd: 0.08,
        netEdgeBps: 800,
        conversionVaultFeePusd: 0.01,
        targetShares: 10,
        estimatedCapitalPusd: 9,
      },
      nowMs,
    );
    book.recordFill('evt-ok', {
      orderId: 'o1',
      conditionId: 'c1',
      tokenId: 't1',
      outcome: 'A',
      price: 0.45,
      quantity: 10,
      fees: '0',
      aggressive: false,
      atMs: nowMs,
    });
    book.recordFill('evt-ok', {
      orderId: 'o2',
      conditionId: 'c2',
      tokenId: 't2',
      outcome: 'B',
      price: 0.45,
      quantity: 10,
      fees: '0',
      aggressive: true,
      atMs: nowMs,
    });

    const settleSpy = vi.fn().mockResolvedValue(undefined);
    const stats = { preflightPassed: 0, preflightBlocked: 0, excludedFiveMinuteEvents: 0 };
    const ctfPreflight = {
      simulateMergePositions: vi.fn().mockResolvedValue({
        ok: true,
        to: '0xctf',
        calldata: '0x1234',
        mode: 'offline-sim',
      }),
      simulateConvertPositions: vi.fn(),
    } as unknown as NonNullable<Parameters<typeof settleOrRecordBundle>[0]['ctfPreflight']>;
    const event = {
      id: 'evt-ok',
      title: 'Test NegRisk Valid Preflight',
      slug: 'test-negrisk-ok',
      markets: [],
    } as unknown as GammaEvent;

    const positions: Parameters<typeof settleOrRecordBundle>[0]['positions'] = [];
    await settleOrRecordBundle({
      event,
      nowMs,
      totalOutcomeCount: 2,
      book,
      cfg: DEFAULT_CONFIG,
      orderManager: { settleBundleConversion: settleSpy } as unknown as OrderManager,
      strategyName: STRATEGY_NAME,
      positions,
      emitTrade: () => {},
      ctfPreflight,
      requirePreflight: true,
      stats,
    });

    expect(stats.preflightPassed).toBe(1);
    expect(stats.preflightBlocked).toBe(0);
    expect(book.isKilled('evt-ok')).toBe(false);
    expect(book.basketTelemetry.complete).toBe(1);
    expect(positions.length).toBe(0);
    expect(settleSpy).toHaveBeenCalledTimes(1);
    expect(settleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 10,
        payoutPerBundlePusd: 1 - DEFAULT_CONFIG.conversionVaultFeePusd,
      }),
    );
  });

  it('routes STALE_FEED_GT_1500MS through evaluatePolyRisk in the 9-scenario stress suite', () => {
    const staleReport = runNineScenarioStressSuite({
      baselineNetPnlPusd: 500,
      baselineSlippagePusd: 50,
      baselineStaleAdverseFillCostPusd: 50,
      baselineLiquidityRewardsPusd: 50,
      fillCount: 10,
      avgFillShares: 10,
      feedAgeMs: 1_501,
    });
    const stale = staleReport.scenarios.find((s) => s.scenarioId === 'STALE_FEED_GT_1500MS')!;
    expect(stale.passed).toBe(true);
    expect(stale.observedAction).toBe('HALT_FAIL_CLOSED');

    const freshReport = runNineScenarioStressSuite({
      baselineNetPnlPusd: 500,
      baselineSlippagePusd: 50,
      baselineStaleAdverseFillCostPusd: 50,
      baselineLiquidityRewardsPusd: 50,
      fillCount: 10,
      avgFillShares: 10,
      feedAgeMs: 100,
    });
    const fresh = freshReport.scenarios.find((s) => s.scenarioId === 'STALE_FEED_GT_1500MS')!;
    expect(fresh.passed).toBe(false);
    expect(fresh.observedAction).toBe('ALLOWED');
  });
});

import { describe, expect, it } from 'vitest';
import { Wallet } from 'ethers';
import { runObservedQuantAlphaReplay } from '../../src/desk/cli/kpi-poly-observed-replay';
import {
  evaluateMaxDrawdownKpi,
  evaluateNetPnlKpi,
  evaluateProfitFactorKpi,
  evaluateSharpeSortinoKpi,
} from '../../src/desk/cli/kpi-poly-evaluators-performance';
import type { KpiEvaluationInput } from '../../src/desk/cli/kpi-poly-types';
import {
  EngineRestartCooldown,
  POLYGON_CHAIN_ID,
  buildClobV2TypedData,
  classifyClobV2SubmitResponse,
  computeClobV2OrderHash,
  expirationFromNowMs,
  gateOrderThroughCooldown,
  signClobV2Order,
  validateClobV2Order,
} from '../../src/desk/polymarket/clob-v2-order-surface';
import {
  appendCapped,
  bestBidPrice,
  capQuoteSize,
  countAdverseOneSidedFills,
  isCloseToExpiry,
  markoutBps,
  rewardPerVolatility,
  sizeAtLevel as mmSizeAtLevel,
  topFractionByScore,
  topLevels,
} from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker-math';
import { QuoteBook } from '../../src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker-state';
import { BundleBook } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-state';
import { DEFAULT_CONFIG as NEGRISK_DEFAULT_CONFIG } from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-types';
import {
  failfastErrorRate,
  makerOptimisationApplies,
  shouldKillCluster,
  snapToTick,
} from '../../src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-math';

describe('Quant Alpha strategies, CLOB V2 barrel, and KPI performance branch coverage', () => {
  it('covers CLOB V2 surface barrel exports, signing, cooldown gating, and submit classification', async () => {
    const intent = {
      tokenId: '101',
      side: 'BUY' as const,
      price: 0.5,
      size: 10,
      orderType: 'GTC' as const,
      tickSize: 0.01,
      expiration: expirationFromNowMs(1_700_000_000_000, 60_000),
      nonce: '1',
    };
    const valid = validateClobV2Order(intent);
    expect(valid.ok).toBe(true);

    const cfg = {
      verifyingContract: '0x0000000000000000000000000000000000000001',
      chainId: POLYGON_CHAIN_ID,
    };
    const wallet = new Wallet('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    const signed = await signClobV2Order(wallet, intent, cfg);
    expect(signed.signature.startsWith('0x')).toBe(true);
    const typed = buildClobV2TypedData(intent, cfg);
    expect(typed.primaryType).toBe('Order');
    expect(computeClobV2OrderHash(intent, cfg)).toBe(signed.orderHash);

    const cooldown = new EngineRestartCooldown();
    const res425 = classifyClobV2SubmitResponse(425, {}, 1_000);
    expect(res425.kind).toBe('engine-restarting');
    cooldown.noteEngineRestart(1_000);
    const gated = gateOrderThroughCooldown({ ...intent, orderType: 'IOC', postOnly: false }, cooldown, 2_000);
    expect(gated.ok).toBe(false);
  });

  it('covers ToxicityAwareMarketMaker math & state branches and NegRiskBundleBook branches', () => {
    expect(markoutBps(0, 0.5)).toBe(0);
    expect(
      countAdverseOneSidedFills(
        [
          { side: 'yes', markoutBps: -15, atMs: 950 },
          { side: 'yes', markoutBps: -20, atMs: 960 },
          { side: 'no', markoutBps: 10, atMs: 970 },
          { side: 'yes', markoutBps: -10, atMs: 100 }, // outside window
        ],
        1_000,
        200,
        1,
      ),
    ).toBe(true);

    expect(capQuoteSize(0, 100, 50)).toBe(0);
    expect(capQuoteSize(20, 0, 50)).toBe(0);
    expect(capQuoteSize(40, 30, 50)).toBe(30);

    expect(rewardPerVolatility(0, 0, 0.1)).toBe(0);
    expect(rewardPerVolatility(5, 2, 0)).toBe(7);
    expect(rewardPerVolatility(5, 3, 2)).toBe(4);

    expect(topFractionByScore([], 0.5)).toEqual([]);
    expect(
      topFractionByScore(
        [
          { item: 'a', score: 1 },
          { item: 'b', score: 5 },
          { item: 'c', score: 5 },
        ],
        0,
      ),
    ).toEqual(['b']);
    expect(topFractionByScore([{ item: 'x', score: 2 }], 2)).toEqual(['x']);

    expect(isCloseToExpiry('not-a-date', 1_000, 500)).toBe(true);
    expect(isCloseToExpiry(new Date(10_000).toISOString(), 1_000, 5_000)).toBe(false);
    expect(bestBidPrice([{ price: '0.41' }, { price: '0.44' }])).toBe(0.44);
    expect(mmSizeAtLevel([{ price: '0.44', size: '75' }], 0.44)).toBe(75);
    expect(mmSizeAtLevel([{ price: '0.44', size: '75' }], 0.45)).toBe(0);

    const ladder = [{ price: '0.40' }, { price: '0.45' }, { price: '0.42' }];
    expect(topLevels(ladder, 0, 'bid')).toHaveLength(3);
    expect(topLevels(ladder, 2, 'bid').map((l) => l.price)).toEqual(['0.45', '0.42']);
    expect(topLevels(ladder, 2, 'ask').map((l) => l.price)).toEqual(['0.40', '0.42']);
    expect(appendCapped([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);

    const mmBook = new QuoteBook();
    const openedAt = mmBook.dayOpenedAtMs;
    expect(openedAt).toBeGreaterThan(0);
    mmBook.recordYesPrice('tok-mm', 0.48, 10);
    mmBook.recordYesPrice('tok-mm', 0.51, 10);
    const pos = mmBook.recordFill({
      tokenId: 'tok-mm',
      conditionId: 'cond-mm',
      side: 'no',
      price: 0.49,
      quantity: 20,
      orderId: 'ord-mm-1',
      atMs: openedAt + 500,
    });
    expect(pos.tokenQuantity).toBe(20);
    mmBook.fills[0]!.markoutBps = -500;
    expect(
      mmBook.isKilled(openedAt + 600, {
        markoutHorizonMs: 60_000,
        maxOneDirectionalFillsPerMin: 5,
        dailyLossLimitPct: 0.01,
        legNotionalPusd: 100,
        maxPositions: 2,
      }),
    ).toBe('daily-loss-limit');
    mmBook.rollDay(openedAt + 90_000_000);
    expect(mmBook.fills).toHaveLength(0);

    // NegRiskBundleBook & math branches
    expect(snapToTick(Number.NaN, 0.01)).toBe(0);
    expect(failfastErrorRate(2, 0)).toBe(0);
    expect(failfastErrorRate(2, 4)).toBe(0.5);
    expect(shouldKillCluster(0.3, 0.15)).toBe(true);
    expect(makerOptimisationApplies(0.05, 0.04, 0.059)).toBe(true);

    const bBook = new BundleBook();
    expect(bBook.firstFillQuantity('missing')).toBe(0);
    expect(bBook.missingLegs('missing')).toEqual([]);
    expect(bBook.convertibleQuantity('missing')).toBe(0);
    expect(bBook.toPositions('missing')).toEqual([]);
    bBook.open(
      {
        eventId: 'ev-b',
        eventTitle: 'Bundle Event',
        legs: [
          { tokenId: 't1', conditionId: 'c1', outcome: 'A', askPrice: 0.4, displayedShares: 100 },
          { tokenId: 't2', conditionId: 'c2', outcome: 'B', askPrice: 0.4, displayedShares: 100 },
        ],
        totalCostPusd: 0.8,
        takerFeePusd: 0.01,
        netEdgePusd: 0.19,
        makerOptimisationApplies: true,
      },
      1_000,
    );
    bBook.recordAttempt('ev-b', false);
    expect(bBook.killReason('ev-b', 2, NEGRISK_DEFAULT_CONFIG)).toBe('failfast-error-rate');
    bBook.clear();
    expect(bBook.isOpen('ev-b')).toBe(false);
  });

  it('covers empty-L2 observed replay fallback and pilot/NO-GO branches in performance KPI evaluators', async () => {
    const emptyReplay = await runObservedQuantAlphaReplay({
      snapshots: [
        {
          timestamp: '2026-11-01T00:00:00.000Z',
          source: 'prices-history',
          markets: [],
        },
      ],
      l2Steps: [],
      liveEvents: [],
      feeResolver: { resolve: async () => null },
      capitalUsdc: 3_000,
      tokenToCluster: new Map(),
    });
    expect(emptyReplay.equityCurve).toHaveLength(1);
    expect(emptyReplay.equityCurve[0]!.equity).toBe(3_000);

    const basePerf: KpiEvaluationInput['performance'] = {
      initialNavPusd: 10_000,
      equityCurve: Array.from({ length: 25 }, (_, i) => ({
        timestamp: new Date(1_700_000_000_000 + i * 86_400_000).toISOString(),
        equity: 10_000 + i * 15,
      })),
      closedCycles: [
        { eventClusterId: 'only-one-cluster', netPnlPusd: 120, feeAndSlippagePusd: 2, notionalPusd: 500 },
      ],
      relayerAndApiCostPusd: 0,
      lockedCapitalAvgPusd: 100,
      observationSpanDays: 95,
      paperShadowDays: 25,
      mode: 'pilot',
      strategyClass: 'event-driven',
      nTrials: 3,
      periodsPerYear: 365,
    };

    // Single-cluster concentration NO-GO
    const singleClusterRes = evaluateNetPnlKpi(basePerf);
    expect(singleClusterRes.verdict).toBe('NO-GO');

    // Negative net PnL NO-GO
    const negRes = evaluateNetPnlKpi({
      ...basePerf,
      closedCycles: [{ eventClusterId: 'c1', netPnlPusd: -10, feeAndSlippagePusd: 1, notionalPusd: 100 }],
    });
    expect(negRes.verdict).toBe('NO-GO');

    // Pilot mode drawdown < 2.5% -> GO and >= 3.0% -> NO-GO
    expect(evaluateMaxDrawdownKpi(basePerf).verdict).toBe('GO');
    expect(
      evaluateMaxDrawdownKpi({
        ...basePerf,
        equityCurve: [
          { timestamp: '2026-11-01T00:00:00Z', equity: 10_000 },
          { timestamp: '2026-11-02T00:00:00Z', equity: 9_600 },
        ],
      }).verdict,
    ).toBe('NO-GO');
    expect(evaluateMaxDrawdownKpi({ ...basePerf, equityCurve: [] }).verdict).toBe('NOT ENOUGH DATA');

    // Sim-90d mode >= 90d within 4% -> GO, >= 4% -> NO-GO
    expect(evaluateMaxDrawdownKpi({ ...basePerf, mode: 'sim-90d' }).verdict).toBe('GO');
    expect(
      evaluateMaxDrawdownKpi({
        ...basePerf,
        mode: 'sim-90d',
        equityCurve: [
          { timestamp: '2026-11-01T00:00:00Z', equity: 10_000 },
          { timestamp: '2026-11-02T00:00:00Z', equity: 9_500 },
        ],
      }).verdict,
    ).toBe('NO-GO');

    // Sharpe/Sortino >= 20 steps evaluation + Profit Factor insufficient vs sufficient cycles
    const sharpeRes = evaluateSharpeSortinoKpi(basePerf);
    expect(['GO', 'NO-GO']).toContain(sharpeRes.verdict);

    expect(evaluateProfitFactorKpi(basePerf).verdict).toBe('NOT ENOUGH DATA');
    const manyCycles = Array.from({ length: 35 }, (_, idx) => ({
      eventClusterId: `c-${idx % 4}`,
      netPnlPusd: idx % 5 === 0 ? -5 : 15,
      feeAndSlippagePusd: 1,
      notionalPusd: 100,
    }));
    expect(evaluateProfitFactorKpi({ ...basePerf, closedCycles: manyCycles }).verdict).toBe('GO');
  });
});

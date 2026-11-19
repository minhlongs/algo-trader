import { describe, expect, it } from 'vitest';
import {
  assertExecutionModelMetricAllowed,
  EXECUTION_MODEL_MATRIX,
} from '../../src/desk/polymarket/execution-model-matrix';
import { createGammaFeeScheduleResolver } from '../../src/desk/polymarket/fee-schedule-resolver';
import {
  calcMakerRebatePerShare,
  calcMakerRebateV2,
  calcQuadraticTakerFeeRateV2,
  calcQuadraticTakerFeeV2,
  calcTakerFeePerShare,
  EXEMPT_FEE_SCHEDULE,
  type PolymarketFeeSchedule,
} from '../../src/desk/polymarket/polymarket-fee-calculator';

describe('EXECUTION_MODEL_MATRIX invariants', () => {
  it('forbids TAKER_HARNESS_PAPER_BETA from emitting maker-only metrics', () => {
    const spec = EXECUTION_MODEL_MATRIX.TAKER_HARNESS_PAPER_BETA;
    expect(spec.orderType).toBe('TAKER_CROSS_SPREAD');
    expect(spec.postOnlyRequired).toBe(false);

    expect(() => assertExecutionModelMetricAllowed('TAKER_HARNESS_PAPER_BETA', 'maker_markout_bps')).toThrow(/FORBIDDEN/);
    expect(() => assertExecutionModelMetricAllowed('TAKER_HARNESS_PAPER_BETA', 'maker_queue_fill_rate')).toThrow(/FORBIDDEN/);
    expect(() => assertExecutionModelMetricAllowed('TAKER_HARNESS_PAPER_BETA', 'taker_slippage_bps')).not.toThrow();
  });

  it('encodes conservative maker queue, cancel attribution, cancel latency, and 5-min crypto rejection', () => {
    const spec = EXECUTION_MODEL_MATRIX.MAKER_ONLY_QUEUE_CONSERVATIVE;
    expect(spec.postOnlyRequired).toBe(true);
    expect(spec.queueBehindRestingDepthPct).toBe(100);
    expect(spec.cancelAttributionBand).toEqual([0.15, 0.25]);
    expect(spec.cancelLatencyMs).toEqual({ median: 35, p99: 180 });
    expect(spec.modelsStaleQuoteFillDuringCancelFlight).toBe(true);
    expect(spec.zeroLookaheadEnforced).toBe(true);
    expect(spec.rejectsFiveMinCrypto).toBe(true);
    expect(() => assertExecutionModelMetricAllowed('MAKER_ONLY_QUEUE_CONSERVATIVE', 'maker_markout_bps')).not.toThrow();
  });

  it('encodes NegRisk multi-leg passive-first, sequential_failfast FAK, eth_call, and UMA lockup invariants', () => {
    const spec = EXECUTION_MODEL_MATRIX.NEGRISK_MULTI_LEG;
    expect(spec.multiLegPolicy).toEqual({
      thinLegMode: 'passive_first',
      thickLegMode: 'sequential_failfast_fak',
      modelsStrandedLegUnwindCost: true,
      requiresEthCallPreflight: true,
      modelsUmaDisputeLockup: true,
    });
  });

  it('encodes Market-Blind news sealed p_raw and 150-sample 5-gate w_skill=0 lock', () => {
    const spec = EXECUTION_MODEL_MATRIX.MARKET_BLIND_NEWS;
    expect(spec.marketBlindPolicy).toEqual({
      requiresSealedBlindPRawBeforeMarketRead: true,
      minOosResolvedForecasts: 150,
      requiredGateCount: 5,
      failClosedWSkillZero: true,
    });
    expect(() => assertExecutionModelMetricAllowed('MARKET_BLIND_NEWS', 'retrospective_hindcast_bss')).toThrow(/FORBIDDEN/);
  });
});

describe('Polymarket Dynamic Fee Golden Vectors', () => {
  it('matches exact quadratic formula r_cat * p * (1 - p) for Crypto (0.07), Sports (0.05), Politics/Finance (0.04), Geopolitics (0.00)', () => {
    // Crypto r_cat = 0.07
    const cryptoSched: PolymarketFeeSchedule = { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.20 };
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.50)).toBeCloseTo(0.0175, 10);
    expect(calcTakerFeePerShare(cryptoSched, 0.50)).toBeCloseTo(0.0175, 10);
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.20)).toBeCloseTo(0.0112, 10);
    expect(calcMakerRebatePerShare(cryptoSched, 0.50)).toBeCloseTo(0.0035, 10);
    expect(calcMakerRebateV2('crypto', 0.50, 100)).toBeCloseTo(0.35, 10);

    // Sports r_cat = 0.05
    const sportsSched: PolymarketFeeSchedule = { exponent: 1, rate: 0.05, takerOnly: true, rebateRate: 0.20 };
    expect(calcQuadraticTakerFeeRateV2('sports', 0.50)).toBeCloseTo(0.0125, 10);
    expect(calcTakerFeePerShare(sportsSched, 0.50)).toBeCloseTo(0.0125, 10);
    expect(calcQuadraticTakerFeeRateV2('sports', 0.40)).toBeCloseTo(0.012, 10);

    // Politics & Finance r_cat = 0.04 (25% maker rebate)
    const politicsSched: PolymarketFeeSchedule = { exponent: 1, rate: 0.04, takerOnly: true, rebateRate: 0.25 };
    expect(calcQuadraticTakerFeeRateV2('politics', 0.50)).toBeCloseTo(0.01, 10);
    expect(calcQuadraticTakerFeeRateV2('finance', 0.50)).toBeCloseTo(0.01, 10);
    expect(calcTakerFeePerShare(politicsSched, 0.50)).toBeCloseTo(0.01, 10);
    expect(calcMakerRebatePerShare(politicsSched, 0.50)).toBeCloseTo(0.0025, 10);

    // Geopolitics r_cat = 0.00 (fee-exempt)
    expect(calcQuadraticTakerFeeRateV2('geopolitics', 0.50)).toBe(0);
    expect(calcQuadraticTakerFeeV2('geopolitics', 0.50, 500)).toBe(0);
    expect(calcMakerRebateV2('geopolitics', 0.50, 500)).toBe(0);
  });

  it('returns 0 fee when Gamma feesEnabled=false or EXEMPT_FEE_SCHEDULE is used', async () => {
    const resolver = createGammaFeeScheduleResolver({
      baseUrl: 'https://gamma.test',
      fetchImpl: async () =>
        new Response(
          JSON.stringify([{ clobTokenIds: ['tok-exempt'], feesEnabled: false, feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.2 } }]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    const resolved = await resolver.resolve('tok-exempt');
    expect(resolved).toBeNull();
    expect(calcTakerFeePerShare(resolved ?? EXEMPT_FEE_SCHEDULE, 0.50)).toBe(0);
    expect(calcMakerRebatePerShare(resolved ?? EXEMPT_FEE_SCHEDULE, 0.50)).toBe(0);
  });

  it('prevents spread double-counting: taker pays half-spread + fee once, maker postOnly pays 0 taker fee', () => {
    const mid = 0.50;
    const bestAsk = 0.51;
    const shares = 100;
    const explicitFee = calcQuadraticTakerFeeV2('crypto', bestAsk, shares, false);
    const halfSpreadCost = (bestAsk - mid) * shares;
    const totalTakerExecutionCost = halfSpreadCost + explicitFee;

    // Exact sum without double-counting spread inside fee formula
    expect(explicitFee).toBeCloseTo(100 * 0.07 * 0.51 * 0.49, 10);
    expect(totalTakerExecutionCost).toBeCloseTo(1.0 + explicitFee, 10);

    // Maker postOnly order pays zero taker fee
    expect(calcQuadraticTakerFeeRateV2('crypto', bestAsk, true)).toBe(0);
    expect(calcQuadraticTakerFeeV2('crypto', bestAsk, shares, true)).toBe(0);
  });
});

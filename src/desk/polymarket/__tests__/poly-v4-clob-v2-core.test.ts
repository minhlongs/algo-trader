/**
 * POLY-ALPHA-HUNTER-V4 §0.5, §0.6, §3.3 core port tests:
 * CLOB V2 quadratic fee/rebate/reward engine, on-chain aggressor decode, 5-level OFI,
 * volume-synchronized VPIN, 4-state regime, and the Log-Odds A-S market maker.
 */

import { describe, it, expect } from 'vitest';
import {
  CLOB_V2_MAX_BASE_FEE_BPS,
  CLOB_V2_QUADRATIC_RATES,
  DEFAULT_CLOB_V2_CATEGORY,
  calcMakerRebateV2,
  calcLiquidityRewardScoreV2,
  calcQuadraticTakerFeeRateV2,
  calcQuadraticTakerFeeV2,
  classifyMarketCategory,
} from '../polymarket-fee-calculator';
import {
  decodeOnchainAggressorSide,
  computeFiveLevelOfiMicro,
  ofiDecayWeight,
  estimateRegimeFromOfiVpin,
  VolumeSynchronizedVpinEstimator,
} from '../onchain-ofi-vpin-estimator';
import {
  LogOddsAvellanedaStoikovMarketMaker,
  advanceConservativeMakerQueue,
  logOddsToProbability,
  probabilityToLogOdds,
} from '../log-odds-avellaneda-stoikov-mm';

describe('CLOB V2 quadratic taker fee engine', () => {
  it('computes Fee = C * r_cat * p * (1-p), caps at 10%, and charges makers zero', () => {
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.5)).toBeCloseTo(0.0175, 12);
    expect(calcQuadraticTakerFeeRateV2(DEFAULT_CLOB_V2_CATEGORY, 0.5)).toBeCloseTo(0.01, 12);
    const exemptCat = Object.keys(CLOB_V2_QUADRATIC_RATES).find((k) => CLOB_V2_QUADRATIC_RATES[k as keyof typeof CLOB_V2_QUADRATIC_RATES].rCat === 0) as keyof typeof CLOB_V2_QUADRATIC_RATES;
    expect(calcQuadraticTakerFeeRateV2(exemptCat, 0.5)).toBe(0);
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.5)).toBeLessThanOrEqual(CLOB_V2_MAX_BASE_FEE_BPS / 10_000);
    expect(calcQuadraticTakerFeeRateV2('crypto', 0.5, true)).toBe(0);
    expect(calcQuadraticTakerFeeV2('crypto', 0.5, 100, true)).toBe(0);
  });

  it('derives maker rebate and applies two-sided liquidity reward score', () => {
    const takerFee = calcQuadraticTakerFeeV2('crypto', 0.5, 100);
    const rebate = calcMakerRebateV2('crypto', 0.5, 100);
    expect(rebate).toBeCloseTo(takerFee * CLOB_V2_QUADRATIC_RATES.crypto.makerRebatePct, 12);
    expect(CLOB_V2_QUADRATIC_RATES[DEFAULT_CLOB_V2_CATEGORY].makerRebatePct).toBe(0.25);

    const twoSided = calcLiquidityRewardScoreV2({
      maxIncentiveSpread: 0.03, bidDistanceFromMid: 0.005, askDistanceFromMid: 0.005,
      bidSizeShares: 1_000, askSizeShares: 100, midProbability: 0.5,
    });
    const boundary = calcLiquidityRewardScoreV2({
      maxIncentiveSpread: 0.03, bidDistanceFromMid: 0.005, askDistanceFromMid: 0.005,
      bidSizeShares: 1_000, askSizeShares: 100, midProbability: 0.97,
    });
    expect(twoSided.effectiveWeightedScore).toBeGreaterThan(0);
    expect(boundary.effectiveWeightedScore).toBeLessThan(twoSided.effectiveWeightedScore);
    expect(classifyMarketCategory('Will BTC close above 100k this week?')).toBe('crypto');
    expect(classifyMarketCategory('Who wins the presidential election?')).toBe(DEFAULT_CLOB_V2_CATEGORY);
  });
});

describe('on-chain OrderFilled aggressor decode & 5-level OFI', () => {
  it('decodes makerAssetId === 0 as BUY in every numeric encoding', () => {
    expect(decodeOnchainAggressorSide({ makerAssetId: 0 })).toBe('BUY');
    expect(decodeOnchainAggressorSide({ makerAssetId: '0' })).toBe('BUY');
    expect(decodeOnchainAggressorSide({ makerAssetId: '0x0' })).toBe('BUY');
    expect(decodeOnchainAggressorSide({ makerAssetId: 0n })).toBe('BUY');
    expect(decodeOnchainAggressorSide({ makerAssetId: '0x00' })).toBe('BUY');
    expect(decodeOnchainAggressorSide({ makerAssetId: 1 })).toBe('SELL');
    expect(decodeOnchainAggressorSide({ makerAssetId: '0xDeadBeef' })).toBe('SELL');
  });

  it('computes OFI_l = bidDelta - askDelta with exponential depth decay capped at 5 levels', () => {
    expect(ofiDecayWeight(0)).toBeCloseTo(1, 12);
    expect(ofiDecayWeight(1)).toBeCloseTo(Math.exp(-0.6), 12);
    expect(ofiDecayWeight(2)).toBeLessThan(ofiDecayWeight(1));
    const res = computeFiveLevelOfiMicro([
      { priceMicro: 500_000, bidDeltaMicro: 1_000_000, askDeltaMicro: 0 },
      { priceMicro: 499_000, bidDeltaMicro: 0, askDeltaMicro: 1_000_000 },
    ]);
    expect(res.totalOfiLevelsActive).toBe(2);
    expect(res.ofiNormalized).toBeGreaterThan(0);
    expect(res.ofiNormalized).toBeLessThanOrEqual(1);
    expect(computeFiveLevelOfiMicro([]).ofiNormalized).toBe(0);
    const levels = Array.from({ length: 8 }, (_, i) => ({
      priceMicro: 500_000 - i * 1_000, bidDeltaMicro: 1_000_000, askDeltaMicro: 0,
    }));
    expect(computeFiveLevelOfiMicro(levels).levelComputations).toHaveLength(5);
  });
});

describe('volume-synchronized VPIN estimator & 4-state regime', () => {
  it('splits trades into equal-volume buckets and reports rolling toxicity', () => {
    const est = new VolumeSynchronizedVpinEstimator(1_000_000);
    for (let i = 0; i < 3; i++) {
      est.addTrade({ makerAssetId: 0, sharesMicro: 100, notionalUsdMicro: 1_000_000 });
    }
    expect(est.completed).toHaveLength(3);
    expect(est.rollingVpin()).toBeCloseTo(1, 12);

    const balanced = new VolumeSynchronizedVpinEstimator(1_000_000);
    balanced.addTrade({ makerAssetId: 0, sharesMicro: 100, notionalUsdMicro: 500_000 });
    balanced.addTrade({ makerAssetId: 1, sharesMicro: 100, notionalUsdMicro: 500_000 });
    expect(balanced.rollingVpin()).toBeCloseTo(0, 12);
  });

  it('classifies all 4 market regimes accurately', () => {
    const toxic = estimateRegimeFromOfiVpin(0, 0.85);
    expect(toxic.state).toBe(3);
    expect(toxic.isToxicKillSwitchTriggered).toBe(true);
    expect(estimateRegimeFromOfiVpin(0, 0.1, 0.70, 0.95).state).toBe(4);
    expect(estimateRegimeFromOfiVpin(0, 0.1, 0.70, 0.03).state).toBe(4);
    expect(estimateRegimeFromOfiVpin(0.8, 0.1).state).toBe(2);
    expect(estimateRegimeFromOfiVpin(0.1, 0.55).state).toBe(2);
    expect(estimateRegimeFromOfiVpin(0.1, 0.2, 0.70, 0.5).state).toBe(1);
  });
});

describe('Log-Odds Avellaneda-Stoikov MM & conservative queue simulator', () => {
  const mm = new LogOddsAvellanedaStoikovMarketMaker();

  it('quotes two-sided inside cutoffs, skews for inventory, and widens for VPIN', () => {
    expect(logOddsToProbability(probabilityToLogOdds(0.37))).toBeCloseTo(0.37, 9);
    const q = mm.quotePair({
      midProbability: 0.62, yangZhangVarianceDaily: 0.05, inventoryShares: 120,
      ofiNormalized: 0.4, currentVpin: 0.3,
    });
    expect(q.bidPriceMicro).toBeGreaterThanOrEqual(20_000);
    expect(q.askPriceMicro).toBeLessThanOrEqual(980_000);
    expect(q.askPriceMicro).toBeGreaterThan(q.bidPriceMicro);

    const flat = mm.quotePair({
      midProbability: 0.5, yangZhangVarianceDaily: 0.05, inventoryShares: 0, ofiNormalized: 0, currentVpin: 0.05,
    });
    const long = mm.quotePair({
      midProbability: 0.5, yangZhangVarianceDaily: 0.05, inventoryShares: 500, ofiNormalized: 0, currentVpin: 0.65,
    });
    expect(long.reservationLogOdds).toBeLessThan(flat.reservationLogOdds);
    expect(long.optimalHalfSpreadLogOdds).toBeGreaterThan(flat.optimalHalfSpreadLogOdds);
  });

  it('credits only 20% of batch cancels and fills only after queue ahead clears', () => {
    expect(advanceConservativeMakerQueue(100, 0, 500).remainingQueueAheadShares).toBe(0);
    expect(advanceConservativeMakerQueue(100, 50, 0).filledShares).toBe(0);
    const filled = advanceConservativeMakerQueue(10, 50, 0);
    expect(filled.filledShares).toBe(40);
    expect(filled.queueClearedForOurFill).toBe(true);
    expect(advanceConservativeMakerQueue(-5, -10, -20).remainingQueueAheadShares).toBe(0);
  });
});

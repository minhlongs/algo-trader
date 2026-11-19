import { describe, it, expect } from 'vitest';
import {
  CLOB_V2_FEE_SCHEDULE_EFFECTIVE_AT_ISO,
  CLOB_V2_FEE_SCHEDULE_VERSION,
  CLOB_V2_QUADRATIC_RATES,
  assertReconciledMarketFeeMetadata,
  buildReferenceFeeSchedule,
  calcReconciledTakerFeePusd,
  computeMakerRewardBreakdown,
  FeeMetadataError,
  isPriceAlignedToTickSize,
  reconcileMarketFeeMetadata,
  roundFeePusd,
  type PolymarketCategory,
} from '../../src/desk/polymarket/polymarket-fee-calculator';
import { createGammaFeeScheduleResolver } from '../../src/desk/polymarket/fee-schedule-resolver';

const TOKEN_ID = '0xabc123token';

describe('CLOB V2 dynamic fee & rebate schedule reconciliation', () => {
  describe('deterministic golden vectors across published categories (docs.polymarket.com/trading/fees)', () => {
    const cases: Array<{
      category: PolymarketCategory;
      rate: number;
      rebatePct: number;
      fee100At50: number;
      fee100At25: number;
      fee100At90: number;
    }> = [
      { category: 'crypto',      rate: 0.07, rebatePct: 0.20, fee100At50: 1.75, fee100At25: 1.3125, fee100At90: 0.63 },
      { category: 'sports',      rate: 0.05, rebatePct: 0.15, fee100At50: 1.25, fee100At25: 0.9375, fee100At90: 0.45 },
      { category: 'economics',   rate: 0.05, rebatePct: 0.25, fee100At50: 1.25, fee100At25: 0.9375, fee100At90: 0.45 },
      { category: 'culture',     rate: 0.05, rebatePct: 0.25, fee100At50: 1.25, fee100At25: 0.9375, fee100At90: 0.45 },
      { category: 'weather',     rate: 0.05, rebatePct: 0.25, fee100At50: 1.25, fee100At25: 0.9375, fee100At90: 0.45 },
      { category: 'finance',     rate: 0.04, rebatePct: 0.25, fee100At50: 1.00, fee100At25: 0.75,   fee100At90: 0.36 },
      { category: 'politics',    rate: 0.04, rebatePct: 0.25, fee100At50: 1.00, fee100At25: 0.75,   fee100At90: 0.36 },
      { category: 'tech',        rate: 0.04, rebatePct: 0.25, fee100At50: 1.00, fee100At25: 0.75,   fee100At90: 0.36 },
      { category: 'mentions',    rate: 0.04, rebatePct: 0.25, fee100At50: 1.00, fee100At25: 0.75,   fee100At90: 0.36 },
      { category: 'combos',      rate: 0.05, rebatePct: 0.00, fee100At50: 1.25, fee100At25: 0.9375, fee100At90: 0.45 },
      { category: 'geopolitics', rate: 0.00, rebatePct: 0.00, fee100At50: 0,    fee100At25: 0,      fee100At90: 0 },
    ];

    for (const c of cases) {
      it(`matches published spec for ${c.category} at p=0.50, p=0.25, p=0.90`, () => {
        expect(CLOB_V2_QUADRATIC_RATES[c.category]).toEqual({ rCat: c.rate, makerRebatePct: c.rebatePct });
        const ref = buildReferenceFeeSchedule(TOKEN_ID, c.category);
        expect(ref.source).toBe('versioned-reference');
        expect(ref.scheduleVersion).toBe(CLOB_V2_FEE_SCHEDULE_VERSION);
        expect(ref.effectiveAtIso).toBe(CLOB_V2_FEE_SCHEDULE_EFFECTIVE_AT_ISO);

        const r50 = calcReconciledTakerFeePusd(ref, 0.50, 100);
        const r25 = calcReconciledTakerFeePusd(ref, 0.25, 100);
        const r90 = calcReconciledTakerFeePusd(ref, 0.90, 100);
        const rMaker = calcReconciledTakerFeePusd(ref, 0.50, 100, true);

        expect(r50).toEqual({ ok: true, feePusd: c.fee100At50, rawFeePusd: expect.any(Number) });
        expect(r25).toEqual({ ok: true, feePusd: c.fee100At25, rawFeePusd: expect.any(Number) });
        expect(r90).toEqual({ ok: true, feePusd: c.fee100At90, rawFeePusd: expect.any(Number) });
        expect(rMaker).toEqual({ ok: true, feePusd: 0, rawFeePusd: 0 });
        if (c.rate > 0 && r50.ok && r25.ok && r90.ok) {
          expect(r50.feePusd).toBeGreaterThan(r25.feePusd);
          expect(r25.feePusd).toBeGreaterThan(r90.feePusd);
        }
      });
    }

    it('rounds fees to 5 decimal places and zeroes amounts below 0.00001 pUSD', () => {
      // 1 share * 0.07 * 0.01 * 0.99 = 0.000693 -> 0.00069
      expect(roundFeePusd(0.000693)).toBe(0.00069);
      // 1 share * 0.07 * 0.01 * 0.99 -> 0.000696 -> 0.0007
      expect(roundFeePusd(0.000696)).toBe(0.0007);
      // Below 0.00001 minimum rounds down to 0
      expect(roundFeePusd(0.0000049)).toBe(0);
      expect(roundFeePusd(0.00001)).toBe(0.00001);
      expect(roundFeePusd(-1)).toBe(0);
      expect(roundFeePusd(Number.NaN)).toBe(0);
    });
  });

  describe('dynamic market metadata overrides static category table', () => {
    it('uses live venue feeSchedule instead of static reference rates', () => {
      const staticRef = buildReferenceFeeSchedule(TOKEN_ID, 'crypto'); // rate 0.07
      const res = reconcileMarketFeeMetadata({
        tokenId: TOKEN_ID,
        feesEnabled: true,
        feeSchedule: { exponent: 1, rate: 0.035, takerOnly: true, rebateRate: 0.30 },
        tickSize: '0.001',
        orderScoringEligible: true,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.reconciled.source).toBe('venue-metadata');
      expect(res.reconciled.schedule.rate).toBe(0.035);
      expect(res.reconciled.schedule.rate).not.toBe(staticRef.schedule.rate);
      expect(res.reconciled.tickSize).toBe(0.001);
      expect(res.reconciled.orderScoringEligible).toBe(true);

      // 100 shares at 0.501 (valid for 0.001 tick): 100 * 0.035 * 0.501 * 0.499 = 0.8749965 -> 0.875
      const fee = calcReconciledTakerFeePusd(res.reconciled, 0.501, 100);
      expect(fee.ok).toBe(true);
      if (fee.ok) expect(fee.feePusd).toBe(0.875);
    });

    it('accepts feeRateBps when feeSchedule is absent and supports exempt venues', () => {
      const bpsRes = reconcileMarketFeeMetadata({
        tokenId: TOKEN_ID,
        feesEnabled: true,
        feeRateBps: 500, // 0.05
        tickSize: 0.01,
      });
      expect(bpsRes.ok).toBe(true);
      if (bpsRes.ok) expect(bpsRes.reconciled.schedule.rate).toBe(0.05);

      const exemptRes = reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: false });
      expect(exemptRes.ok).toBe(true);
      if (exemptRes.ok) {
        expect(exemptRes.reconciled.feesEnabled).toBe(false);
        expect(exemptRes.reconciled.schedule.rate).toBe(0);
      }
    });

    it('rejects prices misaligned with tickSize', () => {
      expect(isPriceAlignedToTickSize(0.50, 0.01)).toBe(true);
      expect(isPriceAlignedToTickSize(0.505, 0.01)).toBe(false);
      expect(isPriceAlignedToTickSize(0.505, 0.001)).toBe(true);
      const res = reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true, feeRateBps: 700, tickSize: 0.01 });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(calcReconciledTakerFeePusd(res.reconciled, 0.505, 100)).toEqual({ ok: false, reason: 'TICK_SIZE_MISALIGNED' });
    });
  });

  describe('fail-closed on missing, invalid, or out-of-cap metadata', () => {
    it('fails closed when tokenId or feesEnabled is missing', () => {
      expect(reconcileMarketFeeMetadata({ feesEnabled: true, feeRateBps: 700 })).toMatchObject({ ok: false, reason: 'MISSING_TOKEN_ID' });
      expect(reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feeRateBps: 700 })).toMatchObject({ ok: false, reason: 'MISSING_FEES_ENABLED' });
    });

    it('fails closed when feesEnabled=true has missing, non-positive, or >1000 bps rate', () => {
      expect(reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true })).toMatchObject({ ok: false, reason: 'MISSING_FEE_RATE' });
      expect(reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true, feeRateBps: 0 })).toMatchObject({ ok: false, reason: 'INVALID_FEE_RATE' });
      expect(reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true, feeRateBps: -50 })).toMatchObject({ ok: false, reason: 'INVALID_FEE_RATE' });
      expect(reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true, feeRateBps: 1001 })).toMatchObject({ ok: false, reason: 'FEE_RATE_EXCEEDS_CAP' });
      expect(reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true, feeSchedule: { rate: 0.12 } })).toMatchObject({ ok: false, reason: 'FEE_RATE_EXCEEDS_CAP' });
      expect(reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true, feeRateBps: 500, feeSchedule: { rate: 0.07 } })).toMatchObject({ ok: false, reason: 'INVALID_FEE_SCHEDULE' });
      expect(() => assertReconciledMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: true, feeRateBps: 1500 })).toThrow(FeeMetadataError);
    });

    it('Gamma fee-schedule resolver also fails closed on rate exceeding 1000 bps cap', async () => {
      const fetchImpl = (async () =>
        new Response(JSON.stringify([{ feesEnabled: true, feeSchedule: { exponent: 1, rate: 0.15, takerOnly: true, rebateRate: 0.2 } }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch;
      const resolver = createGammaFeeScheduleResolver({ fetchImpl });
      await expect(resolver.resolve(TOKEN_ID)).rejects.toThrow(/feesEnabled=true/);
    });
  });

  describe('fail-closed on mid-session fee-schedule mismatch', () => {
    it('detects rate or feesEnabled drift against cached active schedule', () => {
      const initial = assertReconciledMarketFeeMetadata({
        tokenId: TOKEN_ID,
        feesEnabled: true,
        feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.20 },
      });

      const rateDrift = reconcileMarketFeeMetadata(
        { tokenId: TOKEN_ID, feesEnabled: true, feeSchedule: { exponent: 1, rate: 0.05, takerOnly: true, rebateRate: 0.20 } },
        initial,
      );
      expect(rateDrift).toMatchObject({ ok: false, mismatch: true, reason: 'FEE_SCHEDULE_MISMATCH' });

      const toggleDrift = reconcileMarketFeeMetadata({ tokenId: TOKEN_ID, feesEnabled: false }, initial);
      expect(toggleDrift).toMatchObject({ ok: false, mismatch: true, reason: 'FEE_SCHEDULE_MISMATCH' });

      const unchanged = reconcileMarketFeeMetadata(
        { tokenId: TOKEN_ID, feesEnabled: true, feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.20 } },
        initial,
      );
      expect(unchanged.ok).toBe(true);
    });
  });

  describe('confirmed vs estimated maker rewards separation', () => {
    it('returns 0 confirmed rewards when orderScoringVerified is false', () => {
      const reconciled = assertReconciledMarketFeeMetadata({
        tokenId: TOKEN_ID,
        feesEnabled: true,
        feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.20 },
        orderScoringEligible: true,
      });
      const unverified = computeMakerRewardBreakdown({
        reconciled,
        price: 0.50,
        filledMakerContracts: 100,
        orderScoringVerified: false,
        estimatedLiquidityRewardPusd: 0.42,
      });
      // 100 * 0.07 * 0.25 * 0.20 = 0.35 pUSD rebate (unverified -> estimated only)
      expect(unverified).toEqual({
        confirmedRebatePusd: 0,
        estimatedRebatePusd: 0.35,
        confirmedLiquidityRewardPusd: 0,
        estimatedLiquidityRewardPusd: 0.42,
        orderScoringVerified: false,
      });
    });

    it('separates confirmed rewards cleanly with zero double-counting when verified', () => {
      const reconciled = assertReconciledMarketFeeMetadata({
        tokenId: TOKEN_ID,
        feesEnabled: true,
        feeSchedule: { exponent: 1, rate: 0.07, takerOnly: true, rebateRate: 0.20 },
        orderScoringEligible: true,
      });
      const verified = computeMakerRewardBreakdown({
        reconciled,
        price: 0.50,
        filledMakerContracts: 100,
        orderScoringVerified: true,
        estimatedLiquidityRewardPusd: 0.42,
      });
      expect(verified).toEqual({
        confirmedRebatePusd: 0.35,
        estimatedRebatePusd: 0,
        confirmedLiquidityRewardPusd: 0.42,
        estimatedLiquidityRewardPusd: 0,
        orderScoringVerified: true,
      });
      // No double counting: confirmed + estimated equals exact single-counted rebate & reward
      expect(verified.confirmedRebatePusd + verified.estimatedRebatePusd).toBe(0.35);
      expect(verified.confirmedLiquidityRewardPusd + verified.estimatedLiquidityRewardPusd).toBe(0.42);
    });
  });
});

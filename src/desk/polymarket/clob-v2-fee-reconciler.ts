/**
 * Polymarket CLOB V2 dynamic fee & maker reward reconciler.
 * Ingests per-market venue metadata, fails closed on missing/invalid/drifted
 * schedules, rounds fees to 5 decimals (0.00001 pUSD floor), and separates
 * confirmed (`GET /order-scoring` verified) vs estimated maker rewards.
 */

import {
  CLOB_V2_FEE_SCHEDULE_EFFECTIVE_AT_ISO, CLOB_V2_FEE_SCHEDULE_VERSION,
  CLOB_V2_MAX_BASE_FEE_BPS, CLOB_V2_QUADRATIC_RATES,
  isPriceAlignedToTickSize, roundFeePusd, type PolymarketCategory,
} from '../execution/polymarket-clob-v2-fee-categories';
import type { PolymarketFeeSchedule } from './polymarket-fee-calculator';

export { isPriceAlignedToTickSize, roundFeePusd };
export type FeeScheduleSource = 'venue-metadata' | 'versioned-reference';
export type FeeReconciliationErrorCode =
  | 'MISSING_TOKEN_ID' | 'MISSING_FEES_ENABLED' | 'MISSING_FEE_RATE'
  | 'INVALID_FEE_RATE' | 'FEE_RATE_EXCEEDS_CAP' | 'INVALID_FEE_SCHEDULE'
  | 'INVALID_TICK_SIZE' | 'FEE_SCHEDULE_MISMATCH';

export class FeeMetadataError extends Error {
  readonly code: FeeReconciliationErrorCode;
  readonly mismatch: boolean;
  constructor(code: FeeReconciliationErrorCode, message: string, mismatch = false) {
    super(message);
    this.name = 'FeeMetadataError';
    this.code = code;
    this.mismatch = mismatch;
  }
}

export interface ReconciledFeeSchedule {
  tokenId: string; feesEnabled: boolean; schedule: PolymarketFeeSchedule;
  tickSize: number; orderScoringEligible: boolean;
  scheduleVersion: string; effectiveAtIso: string; source: FeeScheduleSource;
}

export interface MarketFeeMetadataInput {
  tokenId?: string | null; feesEnabled?: boolean | null;
  feeRateBps?: number | string | null;
  feeSchedule?: Partial<PolymarketFeeSchedule> | string | null;
  tickSize?: number | string | null; orderScoringEligible?: boolean | null;
  scheduleVersion?: string; effectiveAtIso?: string;
}

export type FeeReconciliationResult =
  | { ok: true; reconciled: ReconciledFeeSchedule; mismatch: false }
  | { ok: false; reason: FeeReconciliationErrorCode; message: string; mismatch: boolean };

export interface MakerRewardBreakdown {
  confirmedRebatePusd: number; estimatedRebatePusd: number;
  confirmedLiquidityRewardPusd: number; estimatedLiquidityRewardPusd: number;
  orderScoringVerified: boolean;
}

export interface MakerRewardInput {
  reconciled: ReconciledFeeSchedule; price: number; filledMakerContracts: number;
  orderScoringVerified: boolean; estimatedLiquidityRewardPusd?: number;
}

const EXEMPT: PolymarketFeeSchedule = Object.freeze({ exponent: 1, rate: 0, takerOnly: true, rebateRate: 0 });
const MAX_RATE = CLOB_V2_MAX_BASE_FEE_BPS / 10_000;
const EPS = 1e-9;

function toFinite(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const fail = (reason: FeeReconciliationErrorCode, message: string, mismatch = false): FeeReconciliationResult =>
  ({ ok: false, reason, message, mismatch });

/** Build an explicit versioned reference fallback schedule (never mistaken for venue truth). */
export function buildReferenceFeeSchedule(tokenId: string, category: PolymarketCategory, tickSize = 0.01): ReconciledFeeSchedule {
  const ref = CLOB_V2_QUADRATIC_RATES[category];
  const feesEnabled = ref.rCat > 0;
  return {
    tokenId, feesEnabled, tickSize, orderScoringEligible: false,
    schedule: feesEnabled ? { exponent: 1, rate: ref.rCat, takerOnly: true, rebateRate: ref.makerRebatePct } : EXEMPT,
    scheduleVersion: CLOB_V2_FEE_SCHEDULE_VERSION,
    effectiveAtIso: CLOB_V2_FEE_SCHEDULE_EFFECTIVE_AT_ISO,
    source: 'versioned-reference',
  };
}

/** Reconcile dynamic market fee metadata and fail closed on invalid or mismatched updates. */
export function reconcileMarketFeeMetadata(
  marketMeta: MarketFeeMetadataInput,
  expectedSchedule?: ReconciledFeeSchedule | null,
): FeeReconciliationResult {
  const tokenId = typeof marketMeta.tokenId === 'string' ? marketMeta.tokenId.trim() : '';
  if (!tokenId) return fail('MISSING_TOKEN_ID', 'tokenId is required');
  if (typeof marketMeta.feesEnabled !== 'boolean') return fail('MISSING_FEES_ENABLED', 'feesEnabled boolean is required');
  const tickSize = marketMeta.tickSize == null ? 0.01 : toFinite(marketMeta.tickSize);
  if (tickSize === null || tickSize <= 0 || tickSize > 0.5) return fail('INVALID_TICK_SIZE', 'tickSize must be finite in (0, 0.5]');

  let schedule: PolymarketFeeSchedule = EXEMPT;
  if (marketMeta.feesEnabled) {
    let rawObj: Record<string, unknown> | null = null;
    if (typeof marketMeta.feeSchedule === 'string') {
      try {
        const parsed: unknown = JSON.parse(marketMeta.feeSchedule);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('INVALID_FEE_SCHEDULE', 'feeSchedule JSON is not an object');
        rawObj = parsed as Record<string, unknown>;
      } catch { return fail('INVALID_FEE_SCHEDULE', 'feeSchedule JSON parse failed'); }
    } else if (marketMeta.feeSchedule && typeof marketMeta.feeSchedule === 'object') {
      rawObj = marketMeta.feeSchedule as Record<string, unknown>;
    }
    const schedRate = rawObj?.['rate'] !== undefined ? toFinite(rawObj['rate']) : undefined;
    const bpsVal = marketMeta.feeRateBps != null ? toFinite(marketMeta.feeRateBps) : undefined;
    if ((rawObj?.['rate'] !== undefined && schedRate === null) || (marketMeta.feeRateBps != null && bpsVal === null)) {
      return fail('INVALID_FEE_RATE', 'Non-numeric fee rate metadata');
    }
    const bpsRate = bpsVal != null ? bpsVal / 10_000 : undefined;
    if (schedRate != null && bpsRate !== undefined && Math.abs(schedRate - bpsRate) > EPS) {
      return fail('INVALID_FEE_SCHEDULE', 'feeSchedule.rate disagrees with feeRateBps');
    }
    const rate = schedRate ?? bpsRate;
    if (rate == null) return fail('MISSING_FEE_RATE', 'feesEnabled=true requires feeSchedule.rate or feeRateBps');
    if (rate <= 0) return fail('INVALID_FEE_RATE', 'Active fee rate must be > 0');
    if (rate > MAX_RATE + EPS) return fail('FEE_RATE_EXCEEDS_CAP', `Fee rate ${rate} exceeds ${CLOB_V2_MAX_BASE_FEE_BPS} bps cap`);
    const exponent = rawObj?.['exponent'] !== undefined ? toFinite(rawObj['exponent']) : 1;
    const rebateRate = rawObj?.['rebateRate'] !== undefined ? toFinite(rawObj['rebateRate']) : 0;
    if (exponent === null || exponent <= 0 || rebateRate === null || rebateRate < 0 || rebateRate > 1) {
      return fail('INVALID_FEE_SCHEDULE', 'Invalid exponent or rebateRate');
    }
    schedule = { exponent, rate, takerOnly: rawObj?.['takerOnly'] === undefined ? true : Boolean(rawObj['takerOnly']), rebateRate };
  }

  if (expectedSchedule) {
    const same =
      expectedSchedule.tokenId === tokenId &&
      expectedSchedule.feesEnabled === marketMeta.feesEnabled &&
      Math.abs(expectedSchedule.schedule.rate - schedule.rate) <= EPS &&
      Math.abs(expectedSchedule.schedule.exponent - schedule.exponent) <= EPS &&
      Math.abs(expectedSchedule.schedule.rebateRate - schedule.rebateRate) <= EPS &&
      expectedSchedule.schedule.takerOnly === schedule.takerOnly;
    if (!same) return fail('FEE_SCHEDULE_MISMATCH', `Fee schedule changed mid-session for ${tokenId}`, true);
  }

  return {
    ok: true, mismatch: false,
    reconciled: {
      tokenId, feesEnabled: marketMeta.feesEnabled, schedule, tickSize,
      orderScoringEligible: Boolean(marketMeta.orderScoringEligible),
      scheduleVersion: marketMeta.scheduleVersion ?? CLOB_V2_FEE_SCHEDULE_VERSION,
      effectiveAtIso: marketMeta.effectiveAtIso ?? CLOB_V2_FEE_SCHEDULE_EFFECTIVE_AT_ISO,
      source: 'venue-metadata',
    },
  };
}

/** Fail-closed assertion wrapper that throws `FeeMetadataError` on invalid or mismatched metadata. */
export function assertReconciledMarketFeeMetadata(
  marketMeta: MarketFeeMetadataInput,
  expectedSchedule?: ReconciledFeeSchedule | null,
): ReconciledFeeSchedule {
  const res = reconcileMarketFeeMetadata(marketMeta, expectedSchedule);
  if (!res.ok) throw new FeeMetadataError(res.reason, res.message, res.mismatch);
  return res.reconciled;
}

/** Compute 5-decimal rounded taker fee in pUSD with tick-size validation and zero spread double-counting. */
export function calcReconciledTakerFeePusd(
  reconciled: ReconciledFeeSchedule, price: number, contracts: number, postOnly = false,
): { ok: true; feePusd: number; rawFeePusd: number } | { ok: false; reason: 'INVALID_CONTRACTS' | 'TICK_SIZE_MISALIGNED' } {
  if (!Number.isFinite(contracts) || contracts < 0) return { ok: false, reason: 'INVALID_CONTRACTS' };
  if (!isPriceAlignedToTickSize(price, reconciled.tickSize)) return { ok: false, reason: 'TICK_SIZE_MISALIGNED' };
  if (postOnly || contracts === 0 || !reconciled.feesEnabled || reconciled.schedule.rate <= 0) return { ok: true, feePusd: 0, rawFeePusd: 0 };
  const rawFeePusd = contracts * reconciled.schedule.rate * Math.pow(price * (1 - price), reconciled.schedule.exponent);
  return { ok: true, feePusd: roundFeePusd(rawFeePusd), rawFeePusd };
}

/** Separate confirmed (`GET /order-scoring` verified) vs estimated maker rebates and liquidity rewards. */
export function computeMakerRewardBreakdown(input: MakerRewardInput): MakerRewardBreakdown {
  const { reconciled, price, filledMakerContracts, orderScoringVerified } = input;
  const valid = Number.isFinite(filledMakerContracts) && filledMakerContracts > 0 && price > 0 && price < 1;
  const rawRebate = valid && reconciled.feesEnabled && reconciled.schedule.rebateRate > 0
    ? filledMakerContracts * reconciled.schedule.rate * Math.pow(price * (1 - price), reconciled.schedule.exponent) * reconciled.schedule.rebateRate
    : 0;
  const rebatePusd = roundFeePusd(rawRebate);
  const liqPusd = roundFeePusd(input.estimatedLiquidityRewardPusd ?? 0);
  const verified = Boolean(orderScoringVerified);
  return {
    confirmedRebatePusd: verified ? rebatePusd : 0, estimatedRebatePusd: verified ? 0 : rebatePusd,
    confirmedLiquidityRewardPusd: verified ? liqPusd : 0, estimatedLiquidityRewardPusd: verified ? 0 : liqPusd,
    orderScoringVerified: verified,
  };
}

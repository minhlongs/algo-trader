/**
 * Backtest Bundle Conversion Settlement
 *
 * Settles exhaustive buy-N-of-N NegRisk bundle conversions on `BacktestOrderManager`
 * without emitting fake CLOB `SELL` orders. An exhaustive bundle of N outcome YES
 * shares redeems `1.00 - conversionVaultFeePusd` per bundle share; entry taker fees
 * apply only on aggressive (IOC/FOK) legs, while thin GTC/GTD maker legs earn/pay
 * maker schedule rates and conversion itself incurs no second CLOB taker leg.
 */

import { DEFAULT_FEE_GAS_PROFILES } from '../sor/fee-gas-model';
import type { FeeScheduleResolver } from '../polymarket/fee-schedule-resolver';
import {
  calcMakerFeeRate,
  calcMakerRebateV2,
  calcQuadraticTakerFeeV2,
  calcTakerFeePerShare,
  type PolymarketCategory,
} from '../polymarket/polymarket-fee-calculator';
import { BACKTEST_VENUE } from './backtest-fee-application';
import type { FillCostDetail } from './backtest-order-manager';
import type { BacktestTrade } from './types';

export interface BundleConversionLegInput {
  tokenId: string;
  aggressive: boolean;
}

export interface BundleConversionParams {
  legs: ReadonlyArray<BundleConversionLegInput>;
  quantity: number;
  payoutPerBundlePusd: number;
  timestamp?: string;
}

interface InternalOpenPosition {
  size: number;
  avgPrice: number;
  entryFills: number;
}

const POSITION_DUST_EPSILON = 1e-9;

export interface BundleLedgerContext {
  positions: Map<string, InternalOpenPosition>;
  trades: BacktestTrade[];
  fillCosts: FillCostDetail[];
  fillEquityCurve: Array<{ timestamp: string; equity: number }>;
  capital: number;
  getCurrentEquity: () => number;
  setCurrentEquity: (next: number) => void;
  currentTimestampIso?: string | null;
  feeResolver?: FeeScheduleResolver;
  clobV2Category?: PolymarketCategory;
  postOnly?: boolean;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function settleBacktestBundleConversion(
  ctx: BundleLedgerContext,
  params: BundleConversionParams,
): Promise<number> {
  const { legs, quantity, payoutPerBundlePusd } = params;
  if (!(quantity > 0) || legs.length === 0) return 0;

  const activeLegs = legs.filter((leg) => (ctx.positions.get(leg.tokenId)?.size ?? 0) > POSITION_DUST_EPSILON);
  if (activeLegs.length !== legs.length) return 0;

  const closeSize = Math.min(
    quantity,
    ...activeLegs.map((leg) => ctx.positions.get(leg.tokenId)!.size),
  );
  if (!(closeSize > POSITION_DUST_EPSILON)) return 0;

  const totalEntryPerShare = activeLegs.reduce(
    (sum, leg) => sum + ctx.positions.get(leg.tokenId)!.avgPrice,
    0,
  );
  const ts = params.timestamp ?? ctx.currentTimestampIso ?? new Date().toISOString();
  const profile = DEFAULT_FEE_GAS_PROFILES[BACKTEST_VENUE];
  let totalNetPnl = 0;

  for (let idx = 0; idx < activeLegs.length; idx++) {
    const leg = activeLegs[idx]!;
    const existing = ctx.positions.get(leg.tokenId)!;
    const redemptionPrice =
      totalEntryPerShare > 0
        ? payoutPerBundlePusd * (existing.avgPrice / totalEntryPerShare)
        : payoutPerBundlePusd / activeLegs.length;
    const grossPnl = closeSize * (redemptionPrice - existing.avgPrice);
    const remaining = existing.size - closeSize;
    const fullyClosed = remaining <= POSITION_DUST_EPSILON;
    if (fullyClosed) {
      ctx.positions.delete(leg.tokenId);
    } else {
      ctx.positions.set(leg.tokenId, {
        size: remaining,
        avgPrice: existing.avgPrice,
        entryFills: existing.entryFills,
      });
    }

    const schedule = ctx.feeResolver ? await ctx.feeResolver.resolve(leg.tokenId) : undefined;
    let feeUsd = 0;
    let rebateUsd = 0;
    if (schedule === undefined) {
      if (ctx.clobV2Category) {
        if (!leg.aggressive || ctx.postOnly) {
          rebateUsd = calcMakerRebateV2(ctx.clobV2Category, existing.avgPrice, closeSize);
        } else {
          feeUsd = calcQuadraticTakerFeeV2(ctx.clobV2Category, existing.avgPrice, closeSize, false);
        }
      } else {
        feeUsd = leg.aggressive
          ? existing.avgPrice * closeSize * (profile.takerFeeBps / 10_000)
          : 0;
      }
    } else if (schedule !== null) {
      if (leg.aggressive) {
        feeUsd = calcTakerFeePerShare(schedule, existing.avgPrice) * closeSize;
      } else {
        const perShare = schedule.takerOnly
          ? calcMakerFeeRate(schedule, existing.avgPrice) * existing.avgPrice
          : calcTakerFeePerShare(schedule, existing.avgPrice);
        feeUsd = perShare * closeSize;
      }
    }

    const gasFills = (fullyClosed ? existing.entryFills : 0) + (idx === activeLegs.length - 1 ? 1 : 0);
    const feeRounded = roundUsd(feeUsd);
    const gasRounded = roundUsd(profile.gasCostUsd * gasFills);
    const rebateRounded = roundUsd(rebateUsd);
    const venueCostUsd = roundUsd(Math.max(0, feeRounded + gasRounded));
    const netPnl = roundUsd(roundUsd(grossPnl) - roundUsd(feeRounded + gasRounded) + rebateRounded);

    const trade: BacktestTrade = {
      timestamp: ts,
      tokenId: leg.tokenId,
      side: 'SELL',
      price: redemptionPrice,
      size: closeSize,
      pnl: netPnl,
      venueCostUsd,
    };
    ctx.trades.push(trade);
    if (ctx.fillEquityCurve.length === 0) {
      ctx.fillEquityCurve.push({ timestamp: ctx.trades[0]!.timestamp, equity: ctx.capital });
    }
    ctx.fillCosts.push({
      grossPnlUsd: roundUsd(grossPnl),
      feeUsd: feeRounded,
      gasUsd: gasRounded,
      ...(ctx.clobV2Category ? { rebateUsd: rebateRounded } : {}),
      netPnlUsd: netPnl,
    });
    const nextEq = roundUsd(ctx.getCurrentEquity() + netPnl);
    ctx.setCurrentEquity(nextEq);
    ctx.fillEquityCurve.push({ timestamp: ts, equity: nextEq });
    totalNetPnl = roundUsd(totalNetPnl + netPnl);
  }

  return totalNetPnl;
}

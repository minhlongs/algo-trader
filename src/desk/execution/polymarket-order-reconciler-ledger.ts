/**
 * Polymarket Order Reconciler — Micro-Unit FIFO Ledger Integration (`POLY-ALPHA-HUNTER-V4` §13.2)
 *
 * Bridges `PolymarketOrderReconciler` lifecycle fill/settlement events into
 * `IntegerMicroUnitFifoLedger` and handles backward-compatible snapshot
 * serialization and hydration.
 */

import {
  IntegerMicroUnitFifoLedger,
  MICRO_PER_PUSD,
  type OpenLot,
  type UnrealizedMtmResult,
} from './integer-micro-unit-fifo-ledger';
import type { OrderLifecycleEvent, ReconciledOrderRecord } from './polymarket-order-reconciler';

export interface FifoLedgerSnapshot {
  realizableCashMicro: number;
  realizedTradingPnlMicro: number;
  accruedRebateIncomeMicro: number;
  accruedLiquidityRewardMicro: number;
  settledRedemptionPnlMicro: number;
  totalTakerFeesPaidMicro: number;
  openLotsByToken: Record<string, OpenLot[]>;
}

export interface ReconcilerFifoSummary {
  realizedTradingPnlMicro: number;
  accruedRebateIncomeMicro: number;
  accruedLiquidityRewardMicro: number;
  settledRedemptionPnlMicro: number;
  totalTakerFeesPaidMicro: number;
  totalRealizedNetPnlMicro: number;
  openSharesMicroByToken: Record<string, number>;
  openCostBasisMicroByToken: Record<string, number>;
}

/**
 * Record a `PARTIALLY_FILLED` or `FILLED` lifecycle event into `IntegerMicroUnitFifoLedger`.
 * Any uncovered `SELL` shortfall is seeded via an open lot so legacy positions never throw.
 */
export function recordFillInFifoLedger(
  ledger: IntegerMicroUnitFifoLedger,
  order: ReconciledOrderRecord,
  event: OrderLifecycleEvent,
): void {
  const deltaSize = event.fillSize ?? 0;
  if (deltaSize <= 0) return;

  const fillPrice = event.fillPrice ?? order.limitPrice;
  const rawFeeUsdc = event.feeUsdc ?? 0;
  const positiveFeeUsdc = rawFeeUsdc > 0 ? rawFeeUsdc : 0;
  const implicitMakerRebateUsdc = rawFeeUsdc < 0 ? -rawFeeUsdc : 0;
  const sharesMicro = Math.round(deltaSize * MICRO_PER_PUSD);
  const priceMicro = Math.round(fillPrice * MICRO_PER_PUSD);
  const feeMicro = Math.round(positiveFeeUsdc * MICRO_PER_PUSD);
  const rebateMicro = Math.round(((event.rebateUsdc ?? 0) + implicitMakerRebateUsdc) * MICRO_PER_PUSD);
  const liquidityRewardMicro = Math.round((event.liquidityRewardUsdc ?? 0) * MICRO_PER_PUSD);

  if (order.side === 'BUY') {
    ledger.apply({ kind: 'buy', tokenId: order.tokenId, sharesMicro, priceMicro, feeMicro, rebateMicro, liquidityRewardMicro });
    return;
  }

  ensureSufficientLots(ledger, order.tokenId, sharesMicro, priceMicro);
  ledger.apply({ kind: 'sell', tokenId: order.tokenId, sharesMicro, priceMicro, feeMicro, rebateMicro, liquidityRewardMicro });
}

function ensureSufficientLots(
  ledger: IntegerMicroUnitFifoLedger,
  tokenId: string,
  requiredSharesMicro: number,
  fallbackPriceMicro: number,
): void {
  const availableMicro = ledger.openSharesMicro(tokenId);
  if (availableMicro < requiredSharesMicro) {
    const lots = ledger.openLots.get(tokenId) ?? [];
    lots.push({ sharesMicro: requiredSharesMicro - availableMicro, priceMicro: fallbackPriceMicro, entryFeeMicro: 0 });
    ledger.openLots.set(tokenId, lots);
  }
}

/** Settle an open token position at binary market resolution (`$0.00` or `$1.00` per share) into `settledRedemptionPnlMicro`. */
export function recordSettlementInFifoLedger(
  ledger: IntegerMicroUnitFifoLedger,
  tokenId: string,
  shares: number,
  payoutPerShareUsdc: 0 | 1,
): { settledSharesMicro: number; settledRedemptionPnlDeltaMicro: number; settledRedemptionPnlUsdc: number } {
  const sharesMicro = Math.round(shares * MICRO_PER_PUSD);
  if (sharesMicro <= 0) return { settledSharesMicro: 0, settledRedemptionPnlDeltaMicro: 0, settledRedemptionPnlUsdc: 0 };
  ensureSufficientLots(ledger, tokenId, sharesMicro, Math.round(0.5 * MICRO_PER_PUSD));
  const beforeMicro = ledger.settledRedemptionPnlMicro;
  ledger.apply({ kind: 'settle', tokenId, sharesMicro, priceMicro: payoutPerShareUsdc * MICRO_PER_PUSD });
  const deltaMicro = ledger.settledRedemptionPnlMicro - beforeMicro;
  return { settledSharesMicro: sharesMicro, settledRedemptionPnlDeltaMicro: deltaMicro, settledRedemptionPnlUsdc: deltaMicro / MICRO_PER_PUSD };
}

/** Mark an open token position to market against Bid book depth (PnL tier 5). */
export function computeUnrealizedMtmFromFifoLedger(
  ledger: IntegerMicroUnitFifoLedger,
  tokenId: string,
  bidLevels: Array<{ price: number; size: number }>,
  exitFeeBps = 0,
): UnrealizedMtmResult & { unrealizedMtmUsdc: number } {
  const bidLevelsMicro = bidLevels.map((b) => ({
    priceMicro: Math.round(b.price * MICRO_PER_PUSD),
    sharesMicro: Math.round(b.size * MICRO_PER_PUSD),
  }));
  const res = ledger.computeUnrealizedMtmMicro(tokenId, bidLevelsMicro, exitFeeBps);
  return { ...res, unrealizedMtmUsdc: res.unrealizedMtmMicro / MICRO_PER_PUSD };
}

export function buildFifoSummary(ledger: IntegerMicroUnitFifoLedger): ReconcilerFifoSummary {
  const openSharesMicroByToken: Record<string, number> = {};
  const openCostBasisMicroByToken: Record<string, number> = {};
  for (const tokenId of ledger.openLots.keys()) {
    openSharesMicroByToken[tokenId] = ledger.openSharesMicro(tokenId);
    openCostBasisMicroByToken[tokenId] = ledger.openCostBasisMicro(tokenId);
  }
  return {
    realizedTradingPnlMicro: ledger.realizedTradingPnlMicro,
    accruedRebateIncomeMicro: ledger.accruedRebateIncomeMicro,
    accruedLiquidityRewardMicro: ledger.accruedLiquidityRewardMicro,
    settledRedemptionPnlMicro: ledger.settledRedemptionPnlMicro,
    totalTakerFeesPaidMicro: ledger.totalTakerFeesPaidMicro,
    totalRealizedNetPnlMicro: ledger.totalRealizedNetPnlMicro(),
    openSharesMicroByToken,
    openCostBasisMicroByToken,
  };
}

export function serializeFifoLedger(ledger: IntegerMicroUnitFifoLedger): FifoLedgerSnapshot {
  const openLotsByToken: Record<string, OpenLot[]> = {};
  for (const [tokenId, lots] of ledger.openLots.entries()) {
    openLotsByToken[tokenId] = lots.map((lot) => ({ ...lot }));
  }
  return {
    realizableCashMicro: ledger.realizableCashMicro,
    realizedTradingPnlMicro: ledger.realizedTradingPnlMicro,
    accruedRebateIncomeMicro: ledger.accruedRebateIncomeMicro,
    accruedLiquidityRewardMicro: ledger.accruedLiquidityRewardMicro,
    settledRedemptionPnlMicro: ledger.settledRedemptionPnlMicro,
    totalTakerFeesPaidMicro: ledger.totalTakerFeesPaidMicro,
    openLotsByToken,
  };
}

export function hydrateFifoLedger(
  ledger: IntegerMicroUnitFifoLedger,
  fifoSnapshot: FifoLedgerSnapshot | undefined,
  fallbackPositions: Record<string, number>,
  orders: ReconciledOrderRecord[],
): void {
  ledger.openLots.clear();
  if (fifoSnapshot) {
    ledger.realizableCashMicro = fifoSnapshot.realizableCashMicro;
    ledger.realizedTradingPnlMicro = fifoSnapshot.realizedTradingPnlMicro;
    ledger.accruedRebateIncomeMicro = fifoSnapshot.accruedRebateIncomeMicro;
    ledger.accruedLiquidityRewardMicro = fifoSnapshot.accruedLiquidityRewardMicro;
    ledger.settledRedemptionPnlMicro = fifoSnapshot.settledRedemptionPnlMicro;
    ledger.totalTakerFeesPaidMicro = fifoSnapshot.totalTakerFeesPaidMicro;
    for (const [tokenId, lots] of Object.entries(fifoSnapshot.openLotsByToken ?? {})) {
      if (lots.length > 0) ledger.openLots.set(tokenId, lots.map((l) => ({ ...l })));
    }
    return;
  }

  ledger.realizableCashMicro = 0;
  ledger.realizedTradingPnlMicro = 0;
  ledger.accruedRebateIncomeMicro = 0;
  ledger.accruedLiquidityRewardMicro = 0;
  ledger.settledRedemptionPnlMicro = 0;
  ledger.totalTakerFeesPaidMicro = 0;

  for (const [tokenId, posShares] of Object.entries(fallbackPositions)) {
    if (posShares <= 0) continue;
    const matchingBuy = orders.find((o) => o.tokenId === tokenId && o.side === 'BUY' && o.filledSize > 0);
    const avgPrice = matchingBuy?.avgFillPrice ?? 0.5;
    ledger.openLots.set(tokenId, [
      { sharesMicro: Math.round(posShares * MICRO_PER_PUSD), priceMicro: Math.round(avgPrice * MICRO_PER_PUSD), entryFeeMicro: 0 },
    ]);
  }
}

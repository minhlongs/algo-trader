/**
 * Integer Micro-Unit FIFO Ledger (CLOB V2, `POLY-ALPHA-HUNTER-V4` §13.2)
 *
 * All value is tracked in integer micro-units (`1 unit = 10^-6 pUSD`) so no rounding
 * drift can accumulate across partial fills, rebate accrual, or the 6-decimal
 * `avg_price` ROUND_DOWN truncation bug in `/v2/activity`.
 *
 * Five PnL tiers are kept strictly separated:
 *   1. realizedTradingPnlMicro      — cash PnL from round-trip lot disposal (buy/sell)
 *   2. accruedRebateIncomeMicro     — maker postOnly rebate income (v4 §0.6)
 *   3. accruedLiquidityRewardMicro  — quadratic liquidity reward accrual (v4 §0.6)
 *   4. settledRedemptionPnlMicro    — settlement at $1.00 / $0.00 resolution
 *   5. unrealizedMtmMicro           — mark-to-market of open lots at VWAP Bid minus exit taker fee
 */

import {
  mulDivMicro,
  priceOpenPositionToMarketMicro,
  type BidLevelMicro,
  type UnrealizedMtmResult,
} from './integer-micro-unit-mtm';

export { MICRO_PER_PUSD, mulDivMicro } from './integer-micro-unit-mtm';
export type { BidLevelMicro, UnrealizedMtmResult } from './integer-micro-unit-mtm';

export type LedgerEventKind = 'open' | 'buy' | 'sell' | 'settle';

export interface LedgerEvent {
  kind: LedgerEventKind;
  tokenId: string;
  /** Quantity in micro-shares (1 share = 1_000_000) */
  sharesMicro: number;
  /** Unit price in micro-pUSD ($1.00 = 1_000_000) */
  priceMicro: number;
  /** Taker/maker fee actually charged for this leg, in micro-pUSD */
  feeMicro?: number;
  /** Maker rebate income for a passive fill, in micro-pUSD */
  rebateMicro?: number;
  /** Liquidity reward income attributed to this fill, in micro-pUSD */
  liquidityRewardMicro?: number;
}

export interface OpenLot {
  sharesMicro: number;
  priceMicro: number;
  entryFeeMicro: number;
}

export class IntegerMicroUnitFifoLedger {
  /** Per-token open FIFO lots, ordered oldest → newest */
  readonly openLots: Map<string, OpenLot[]> = new Map();
  realizableCashMicro = 0;

  realizedTradingPnlMicro = 0;
  accruedRebateIncomeMicro = 0;
  accruedLiquidityRewardMicro = 0;
  settledRedemptionPnlMicro = 0;
  totalTakerFeesPaidMicro = 0;

  apply(event: LedgerEvent): void {
    if (event.sharesMicro < 0 || event.priceMicro < 0) {
      throw new Error('LedgerEvent sharesMicro and priceMicro must be non-negative');
    }
    const feeMicro = event.feeMicro ?? 0;
    const rebateMicro = event.rebateMicro ?? 0;
    const rewardMicro = event.liquidityRewardMicro ?? 0;

    if (event.kind === 'buy' || event.kind === 'open') {
      const notionalMicro = mulDivMicro(event.sharesMicro, event.priceMicro);
      this.accrueIncome(feeMicro, rebateMicro, rewardMicro);
      this.realizableCashMicro += rebateMicro + rewardMicro - notionalMicro - feeMicro;
      this.pushLot(event.tokenId, {
        sharesMicro: event.sharesMicro,
        priceMicro: event.priceMicro,
        entryFeeMicro: feeMicro,
      });
      return;
    }

    if (event.kind === 'sell') {
      const grossProceedsMicro = mulDivMicro(event.sharesMicro, event.priceMicro);
      // Dispose inventory first: an over-sell throw must leave no cash, lot, or income state behind.
      const disposedCostMicro = this.disposeFifoCost(event.tokenId, event.sharesMicro);
      this.accrueIncome(feeMicro, rebateMicro, rewardMicro);
      this.realizableCashMicro += grossProceedsMicro - feeMicro + rebateMicro + rewardMicro;
      this.realizedTradingPnlMicro += grossProceedsMicro - feeMicro - disposedCostMicro;
      return;
    }

    this.settle(event, feeMicro, rebateMicro, rewardMicro);
  }

  /**
   * Fee/rebate/reward accruals, applied only once the leg's inventory disposal is
   * known to succeed — a rejected event must not mint income.
   */
  private accrueIncome(feeMicro: number, rebateMicro: number, rewardMicro: number): void {
    this.totalTakerFeesPaidMicro += feeMicro;
    this.accruedRebateIncomeMicro += rebateMicro;
    this.accruedLiquidityRewardMicro += rewardMicro;
  }

  private pushLot(tokenId: string, lot: OpenLot): void {
    if (lot.sharesMicro === 0) return;
    const lots = this.openLots.get(tokenId);
    if (lots) lots.push(lot);
    else this.openLots.set(tokenId, [lot]);
  }

  private disposeFifoCost(tokenId: string, sharesToCloseMicro: number): number {
    const lots = this.openLots.get(tokenId);
    if (!lots || lots.length === 0) {
      throw new Error(`Insufficient FIFO inventory for token ${tokenId}`);
    }
    let remaining = sharesToCloseMicro;
    let totalCostBasisMicro = 0;
    while (remaining > 0 && lots.length > 0) {
      const head = lots[0]!;
      const take = Math.min(head.sharesMicro, remaining);
      const lotNotionalMicro = mulDivMicro(take, head.priceMicro);
      const allocatedEntryFeeMicro = Math.floor((head.entryFeeMicro * take) / head.sharesMicro);
      totalCostBasisMicro += lotNotionalMicro + allocatedEntryFeeMicro;
      head.sharesMicro -= take;
      head.entryFeeMicro -= allocatedEntryFeeMicro;
      remaining -= take;
      if (head.sharesMicro === 0) lots.shift();
    }
    if (remaining > 0) {
      throw new Error(`Insufficient FIFO inventory for token ${tokenId}: short ${remaining}`);
    }
    if (lots.length === 0) this.openLots.delete(tokenId);
    return totalCostBasisMicro;
  }

  private settle(
    event: LedgerEvent,
    feeMicro: number,
    rebateMicro: number,
    rewardMicro: number,
  ): void {
    const payoutMicro = mulDivMicro(event.sharesMicro, event.priceMicro);
    const disposedCostMicro = this.disposeFifoCost(event.tokenId, event.sharesMicro);
    this.accrueIncome(feeMicro, rebateMicro, rewardMicro);
    this.realizableCashMicro += payoutMicro - feeMicro + rebateMicro + rewardMicro;
    this.settledRedemptionPnlMicro += payoutMicro - feeMicro - disposedCostMicro;
  }

  /** Net realized + settled + accrued income (excludes unrealized MTM). */
  totalRealizedNetPnlMicro(): number {
    return (
      this.realizedTradingPnlMicro
      + this.accruedRebateIncomeMicro
      + this.accruedLiquidityRewardMicro
      + this.settledRedemptionPnlMicro
    );
  }

  /** Remaining open shares for a token, in micro-shares */
  openSharesMicro(tokenId: string): number {
    const lots = this.openLots.get(tokenId);
    return lots ? lots.reduce((sum, lot) => sum + lot.sharesMicro, 0) : 0;
  }

  /** FIFO cost basis (including unamortized entry fees) of remaining open shares, in micro-pUSD */
  openCostBasisMicro(tokenId: string): number {
    const lots = this.openLots.get(tokenId);
    return lots
      ? lots.reduce((sum, lot) => sum + mulDivMicro(lot.sharesMicro, lot.priceMicro) + lot.entryFeeMicro, 0)
      : 0;
  }

  /**
   * Mark an open position to market using the VWAP the bid book would actually pay
   * for the size it can absorb, net of the exit taker fee, against FIFO cost basis.
   * The result carries `unfilledSharesMicro` so a shallow book cannot be mistaken
   * for a full liquidation.
   */
  computeUnrealizedMtmMicro(
    tokenId: string,
    bidLevelsMicro: BidLevelMicro[],
    exitFeeBps: number,
  ): UnrealizedMtmResult {
    return priceOpenPositionToMarketMicro(
      this.openSharesMicro(tokenId),
      this.openCostBasisMicro(tokenId),
      bidLevelsMicro,
      exitFeeBps,
    );
  }
}

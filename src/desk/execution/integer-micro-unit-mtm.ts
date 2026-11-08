/**
 * Mark-to-market pricing for open FIFO positions, in integer micro-units
 * (`POLY-ALPHA-HUNTER-V4` §13.2, PnL tier 5).
 *
 * A VWAP only means anything over shares the book can actually absorb, so the
 * result always reports how much of the position stayed unfilled. A position
 * that cannot be fully liquidated must not be valued as though it could: the
 * previous full-liquidation VWAP divided gross proceeds by *total* open shares
 * and understated the exit price by exactly the depth shortfall.
 */

/** 1 pUSD = 1_000_000 micro-units; 1 share = 1_000_000 micro-shares */
export const MICRO_PER_PUSD = 1_000_000;

/** Floor-divide shares × price into micro-pUSD, matching the ledger's rounding */
export function mulDivMicro(sharesMicro: number, priceMicro: number): number {
  return Math.floor((sharesMicro * priceMicro) / MICRO_PER_PUSD);
}

/** One bid level, in integer micro-units */
export interface BidLevelMicro {
  priceMicro: number;
  sharesMicro: number;
}

export interface UnrealizedMtmResult {
  unrealizedMtmMicro: number;
  exitFeeMicro: number;
  /** Executable VWAP over the absorbed depth only; `0` when the book absorbs nothing */
  vwapBidMicro: number;
  filledSharesMicro: number;
  /** Shares the bid book could not absorb at any level */
  unfilledSharesMicro: number;
  /** `true` only when every open share found a resting bid */
  fullyFillable: boolean;
}

/**
 * Price an open position against the bid book: executable VWAP over the
 * absorbed depth only, net of the exit taker fee, against FIFO cost basis.
 */
export function priceOpenPositionToMarketMicro(
  sharesMicro: number,
  costBasisMicro: number,
  bidLevelsMicro: BidLevelMicro[],
  exitFeeBps: number,
): UnrealizedMtmResult {
  const unfilled = (filled: number): UnrealizedMtmResult => ({
    unrealizedMtmMicro: 0,
    exitFeeMicro: 0,
    vwapBidMicro: 0,
    filledSharesMicro: filled,
    unfilledSharesMicro: sharesMicro - filled,
    fullyFillable: filled === sharesMicro,
  });
  if (sharesMicro === 0) return unfilled(0);

  let remaining = sharesMicro;
  let filledSharesMicro = 0;
  let grossProceedsMicro = 0;
  for (const level of bidLevelsMicro) {
    if (remaining <= 0) break;
    const take = Math.min(level.sharesMicro, remaining);
    grossProceedsMicro += mulDivMicro(take, level.priceMicro);
    filledSharesMicro += take;
    remaining -= take;
  }
  if (filledSharesMicro === 0) return unfilled(0);

  const vwapBidMicro = Math.floor((grossProceedsMicro * MICRO_PER_PUSD) / filledSharesMicro);
  const exitFeeMicro = Math.floor((grossProceedsMicro * exitFeeBps) / 10_000);
  return {
    unrealizedMtmMicro: grossProceedsMicro - exitFeeMicro - costBasisMicro,
    exitFeeMicro,
    vwapBidMicro,
    filledSharesMicro,
    unfilledSharesMicro: remaining,
    fullyFillable: remaining === 0,
  };
}

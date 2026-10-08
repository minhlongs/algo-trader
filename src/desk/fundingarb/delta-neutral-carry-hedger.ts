import {
  DeltaNeutralPositionConfig,
  DeltaNeutralHedgeState,
} from './funding-types';

export class DeltaNeutralCarryHedger {
  /**
   * Constructs delta-neutral spot long vs perp short position with liquidation boundary checks
   */
  public constructDeltaNeutralHedge(
    config: DeltaNeutralPositionConfig,
    predicted8hFundingPct: number
  ): DeltaNeutralHedgeState {
    const { capitalUsd, spotPrice, perpMarkPrice, leverage, maintenanceMarginPct } = config;
    if (spotPrice <= 0 || perpMarkPrice <= 0) throw new Error('Prices must be positive');
    if (leverage < 1) throw new Error('Leverage must be >= 1');

    // Allocation: Spot collateral vs Perp margin
    // Total capital split: 1 / (1 + 1/leverage) to spot, remainder to perp margin
    const perpMarginRatio = 1.0 / (leverage + 1.0);
    const perpMarginUsd = capitalUsd * perpMarginRatio;
    const spotCapitalUsd = capitalUsd - perpMarginUsd;

    const notionalPerpUsd = perpMarginUsd * leverage;
    const perpShortQty = notionalPerpUsd / perpMarkPrice;

    // Spot quantity to match perp short notional for delta neutrality
    const spotQty = notionalPerpUsd / spotPrice;
    const netDeltaUsd = (spotQty * spotPrice) - (perpShortQty * perpMarkPrice);

    // Short perp liquidation price: EntryPrice * (1 + 1/Leverage - MaintenanceMargin)
    const mm = maintenanceMarginPct / 100.0;
    const liquidationPricePerp = perpMarkPrice * (1.0 + (1.0 / leverage) - mm);

    const bufferPct = ((liquidationPricePerp - perpMarkPrice) / perpMarkPrice) * 100.0;
    const isLiquidationRiskElevated = bufferPct < 15.0; // Less than 15% upside before liquidation

    // Projected daily cash flow from funding (3 cycles/day)
    const fundingRatePerCycle = predicted8hFundingPct / 100.0;
    const projectedDailyYieldUsd = notionalPerpUsd * fundingRatePerCycle * 3.0;

    return {
      spotQuantity: Number(spotQty.toFixed(6)),
      perpShortQuantity: Number(perpShortQty.toFixed(6)),
      netDeltaUsd: Number(netDeltaUsd.toFixed(4)),
      liquidationPricePerp: Number(liquidationPricePerp.toFixed(2)),
      liquidationBufferPct: Number(bufferPct.toFixed(2)),
      isLiquidationRiskElevated,
      projectedDailyYieldUsd: Number(projectedDailyYieldUsd.toFixed(2)),
    };
  }
}

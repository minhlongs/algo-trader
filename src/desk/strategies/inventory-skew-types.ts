/**
 * Dynamic Inventory Skew Quoter Types
 *
 * Contracts for Avellaneda-Stoikov market making adapted for bounded [0, 1]
 * binary prediction market contracts.
 *
 * @module desk/strategies/inventory-skew-types
 */

export interface InventorySkewConfig {
  readonly riskAversionGamma: number;
  readonly orderFlowLiquidityKappa: number;
  readonly maxAbsInventory: number;
  readonly defaultHalfSpreadBps: number;
  readonly baseOrderSize: number;
}

export interface MarketStateQuoteParams {
  readonly marketId: string;
  readonly midPrice: number;
  readonly netInventory: number;
  readonly timeToExpirySec: number;
  readonly currentVolatility?: number;
}

export interface OptimalQuoteTwoWay {
  readonly marketId: string;
  readonly reservationPrice: number;
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly bidSize: number;
  readonly askSize: number;
  readonly halfSpreadBps: number;
  readonly inventorySkewOffset: number;
  readonly isQuotingActive: boolean;
}

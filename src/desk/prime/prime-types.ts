/**
 * Prime Brokerage & Synthetic Financing Types
 * Locates, securities lending, Total Return Swaps (TRS), and rehypothecation safeguards.
 *
 * @module desk/prime/prime-types
 */

export interface BorrowRateCurvePoint {
  utilizationRate: number; // 0 to 1
  annualizedBorrowFeeBps: number;
}

export interface InventoryPool {
  symbol: string;
  totalQuantity: number;
  allocatedQuantity: number;
  availableQuantity: number;
  internalLendable: number;
  thirdPartyLendable: number;
}

export interface LocateRequest {
  requestId: string;
  clientAccountId: string;
  symbol: string;
  quantity: number;
  requestedAtMs: number;
  validityMs: number;
}

export interface LocateAuthorization {
  locateId: string;
  clientAccountId: string;
  symbol: string;
  quantity: number;
  rateBps: number;
  authorizedAtMs: number;
  expiresAtMs: number;
  status: 'GRANTED' | 'REJECTED' | 'EXPIRED' | 'FULFILLED';
}

export interface TrsContract {
  contractId: string;
  counterpartyId: string;
  underlyingSymbol: string;
  notionalQuantity: number;
  initialPrice: number;
  resetFrequencyDays: number;
  financingSpreadBps: number; // over benchmark (e.g. SOFR)
  lastResetPrice: number;
  lastResetTimestampMs: number;
}

export interface TrsSettlementFlow {
  contractId: string;
  timestampMs: number;
  equityLegPnl: number; // positive = counterparty receives price appreciation
  financingLegDue: number; // interest accrued over period
  netSettlementDue: number; // equityLegPnl - financingLegDue
  counterpartyPaymentDirection: 'RECEIVE' | 'PAY';
}

export interface CollateralAsset {
  assetId: string;
  symbol: string;
  marketValueUsd: number;
  assetClass: 'CASH' | 'TREASURY' | 'EQUITY' | 'CRYPTO';
}

export interface RehypothecationLimits {
  clientAccountId: string;
  totalClientMarginDebitUsd: number;
  maxRehypothecationFactor: number; // e.g. 1.4 under Rule 15c3-3
  segregatedExcessReserveUsd: number;
}

export interface RehypothecationStatus {
  clientAccountId: string;
  eligibleCollateralUsd: number;
  maxPermissiblePledgeUsd: number;
  currentlyPledgedUsd: number;
  availableToPledgeUsd: number;
  isCompliant: boolean;
  excessHaircutUsd: number;
}

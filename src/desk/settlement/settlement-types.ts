/**
 * Institutional Settlement & Post-Trade Allocation Types
 * FIX 4.4/5.0 protocol messages, average price accounts (APAMA), and clearing break diagnostics.
 *
 * @module desk/settlement/settlement-types
 */

export interface FixField {
  tag: number;
  value: string;
}

export interface FixMessage {
  msgType: string;
  senderCompId: string;
  targetCompId: string;
  msgSeqNum: number;
  sendingTime: string;
  fields: FixField[];
}

export interface BlockTradeFill {
  fillId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestampMs: number;
  venueExecutionId: string;
}

export interface AccountAllocationTarget {
  accountId: string;
  percentageBasis: number; // e.g., 0.40 for 40%
  designatedCapacity: 'AGENCY' | 'PRINCIPAL' | 'RISKLESS_PRINCIPAL';
}

export interface AllocatedTradeRecord {
  allocationId: string;
  parentBlockId: string;
  targetAccountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  allocatedQuantity: number;
  averageExecutionPrice: number;
  totalNotionalUsd: number;
  roundingResidualShares: number;
}

export interface InternalTradeRecord {
  tradeId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  settlementDate: string;
  counterparty: string;
}

export interface ClearingHouseRecord {
  clearingTradeId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  settlementDate: string;
  brokerOfRecord: string;
}

export interface SettlementBreakRecord {
  breakId: string;
  internalTradeId?: string;
  clearingTradeId?: string;
  breakType: 'MISSING_IN_CLEARING' | 'MISSING_IN_INTERNAL' | 'QUANTITY_MISMATCH' | 'PRICE_MISMATCH' | 'DATE_MISMATCH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: string;
  resolved: boolean;
}

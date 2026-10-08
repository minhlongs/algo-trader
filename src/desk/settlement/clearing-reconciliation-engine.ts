/**
 * Clearing House Break Reconciliation Engine
 * Identifies trade status discrepancies (quantity, price, missing records) against DTCC/OCC feeds.
 *
 * @module desk/settlement/clearing-reconciliation-engine
 */

import {
  InternalTradeRecord,
  ClearingHouseRecord,
  SettlementBreakRecord,
} from './settlement-types';

export class ClearingReconciliationEngine {
  /**
   * Reconciles internal desk trades against external clearing house matched records.
   */
  public reconcileTrades(
    internalTrades: InternalTradeRecord[],
    clearingRecords: ClearingHouseRecord[]
  ): SettlementBreakRecord[] {
    const breaks: SettlementBreakRecord[] = [];
    const matchedClearingIds = new Set<string>();

    for (const internal of internalTrades) {
      // Find candidate clearing record by matching symbol, side, and settlement date
      const match = clearingRecords.find(
        c => !matchedClearingIds.has(c.clearingTradeId) &&
             c.symbol === internal.symbol &&
             c.side === internal.side &&
             c.settlementDate === internal.settlementDate
      );

      if (!match) {
        breaks.push({
          breakId: `break-missing-clr-${internal.tradeId}`,
          internalTradeId: internal.tradeId,
          breakType: 'MISSING_IN_CLEARING',
          severity: 'HIGH',
          details: `Internal trade ${internal.tradeId} not reported by clearing house for ${internal.symbol}`,
          resolved: false,
        });
        continue;
      }

      matchedClearingIds.add(match.clearingTradeId);

      // Verify Quantity
      if (match.quantity !== internal.quantity) {
        breaks.push({
          breakId: `break-qty-${internal.tradeId}-${match.clearingTradeId}`,
          internalTradeId: internal.tradeId,
          clearingTradeId: match.clearingTradeId,
          breakType: 'QUANTITY_MISMATCH',
          severity: Math.abs(match.quantity - internal.quantity) > 1000 ? 'CRITICAL' : 'MEDIUM',
          details: `Quantity discrepancy: internal=${internal.quantity}, clearing=${match.quantity}`,
          resolved: false,
        });
      }

      // Verify Price (within 1 cent tolerance)
      if (Math.abs(match.price - internal.price) > 0.01) {
        breaks.push({
          breakId: `break-px-${internal.tradeId}-${match.clearingTradeId}`,
          internalTradeId: internal.tradeId,
          clearingTradeId: match.clearingTradeId,
          breakType: 'PRICE_MISMATCH',
          severity: 'HIGH',
          details: `Price discrepancy: internal=${internal.price}, clearing=${match.price}`,
          resolved: false,
        });
      }
    }

    // Identify clearing records with no matching internal trade
    for (const clearing of clearingRecords) {
      if (!matchedClearingIds.has(clearing.clearingTradeId)) {
        breaks.push({
          breakId: `break-missing-int-${clearing.clearingTradeId}`,
          clearingTradeId: clearing.clearingTradeId,
          breakType: 'MISSING_IN_INTERNAL',
          severity: 'HIGH',
          details: `Clearing house reported trade ${clearing.clearingTradeId} with no internal record`,
          resolved: false,
        });
      }
    }

    return breaks;
  }
}

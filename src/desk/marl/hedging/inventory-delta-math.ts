/**
 * Inventory Delta Pure Math & Snapshot Aggregation Helpers
 * Extracted from inventory-delta-tracker.ts for modular delta/notional/margin calculation.
 */

import type {
  DeltaTrackerConfig,
  VenuePositionDelta,
  VenueInventorySummary,
  PortfolioDeltaSnapshot,
} from './inventory-delta-tracker';

export interface InternalPositionState {
  venue: string;
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unitDelta: number;
  netDelta: number;
  notionalUsd: number;
  marginUsed: number;
}

export function computeUpdatedPositionState(
  existing: InternalPositionState | undefined,
  venue: string,
  symbol: string,
  quantity: number,
  price: number,
  unitDelta: number,
  leverage: number,
  roundingDecimals: number,
): InternalPositionState {
  let avgEntryPrice = price;
  if (existing && existing.quantity !== 0 && Math.sign(existing.quantity) === Math.sign(quantity)) {
    const existingNotional = Math.abs(existing.quantity) * existing.avgEntryPrice;
    const additionalNotional = Math.abs(quantity - existing.quantity) * price;
    const totalQty = Math.abs(quantity);
    avgEntryPrice = totalQty > 0 ? (existingNotional + additionalNotional) / totalQty : price;
  }
  const netDelta = Number((quantity * unitDelta).toFixed(roundingDecimals));
  const notionalUsd = Math.abs(quantity * price);
  const marginUsed = leverage > 0 ? notionalUsd / leverage : notionalUsd;
  return {
    venue,
    symbol,
    quantity,
    avgEntryPrice,
    currentPrice: price,
    unitDelta,
    netDelta,
    notionalUsd,
    marginUsed,
  };
}

export function buildPortfolioDeltaSnapshot(
  positions: Iterable<InternalPositionState>,
  config: DeltaTrackerConfig,
  toleranceOverride?: number,
): PortfolioDeltaSnapshot {
  const tolerance = toleranceOverride ?? config.deltaThreshold;
  let polyDelta = 0;
  let cexDelta = 0;
  let grossNotionalUsd = 0;
  let totalMarginUsed = 0;
  const positionsList: VenuePositionDelta[] = [];
  const venueSummaries: Record<string, VenueInventorySummary> = {};

  for (const pos of positions) {
    if (pos.venue.toLowerCase() === 'polymarket') polyDelta += pos.netDelta;
    else cexDelta += pos.netDelta;
    grossNotionalUsd += pos.notionalUsd;
    totalMarginUsed += pos.marginUsed;

    positionsList.push({
      venue: pos.venue,
      symbol: pos.symbol,
      contracts: pos.quantity,
      unitDelta: pos.unitDelta,
      netDelta: pos.netDelta,
      notionalUsd: pos.notionalUsd,
      entryPrice: pos.avgEntryPrice,
      marginUsed: pos.marginUsed,
    });

    const vKey = pos.venue.toLowerCase();
    if (!venueSummaries[vKey]) {
      venueSummaries[vKey] = {
        venue: pos.venue,
        totalPositions: 0,
        netDelta: 0,
        grossNotionalUsd: 0,
        marginUsedUsd: 0,
      };
    }
    venueSummaries[vKey].totalPositions += 1;
    venueSummaries[vKey].netDelta = Number(
      (venueSummaries[vKey].netDelta + pos.netDelta).toFixed(config.roundingDecimals),
    );
    venueSummaries[vKey].grossNotionalUsd += pos.notionalUsd;
    venueSummaries[vKey].marginUsedUsd += pos.marginUsed;
  }

  const netDelta = Number((polyDelta + cexDelta).toFixed(config.roundingDecimals));
  const rebalanceRequired = Math.abs(netDelta) > tolerance;
  const marginUtilization = config.totalEquityUsd > 0
    ? Math.min(1.0, totalMarginUsed / config.totalEquityUsd)
    : 0;

  return {
    netDelta,
    polyDelta: Number(polyDelta.toFixed(config.roundingDecimals)),
    polymarketDelta: Number(polyDelta.toFixed(config.roundingDecimals)),
    cexDelta: Number(cexDelta.toFixed(config.roundingDecimals)),
    grossNotionalUsd: Number(grossNotionalUsd.toFixed(2)),
    positions: positionsList,
    venueSummaries,
    marginUtilization: Number(marginUtilization.toFixed(4)),
    timestamp: Date.now(),
    toleranceThreshold: tolerance,
    rebalanceRequired,
  };
}

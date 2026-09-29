/**
 * Inventory Delta Tracker for MARL Cross-Venue Hedging.
 * Aggregates Polymarket binary contracts and CEX linear positions,
 * calculating real-time net delta, gross notional, and margin utilization.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { z } from 'zod';

export type SupportedHedgingVenue = 'polymarket' | 'binance' | 'bybit' | 'kucoin';

export const DeltaTrackerConfigSchema = z.object({
  deltaThreshold: z.number().positive('Delta threshold must be > 0').default(0.10),
  hysteresisRatio: z.number().min(0.01).max(1.0).default(0.50),
  defaultBinaryDelta: z.number().positive().default(1.0),
  defaultCexDelta: z.number().positive().default(1.0),
  defaultLeverage: z.number().positive().default(1.0),
  roundingDecimals: z.number().int().min(0).max(8).default(4),
  totalEquityUsd: z.number().positive().default(50_000),
});

export type DeltaTrackerConfig = z.infer<typeof DeltaTrackerConfigSchema>;

export interface VenuePositionDelta {
  venue: string; symbol: string; contracts: number; unitDelta: number;
  netDelta: number; notionalUsd: number; entryPrice?: number; marginUsed?: number; unrealizedPnl?: number;
}

export interface VenueInventorySummary {
  venue: string; totalPositions: number; netDelta: number;
  grossNotionalUsd: number; marginUsedUsd: number;
}

export interface PortfolioDeltaSnapshot {
  netDelta: number;
  polyDelta: number;
  polymarketDelta: number;
  cexDelta: number;
  grossNotionalUsd: number;
  positions: VenuePositionDelta[];
  venueSummaries: Record<string, VenueInventorySummary>;
  marginUtilization: number;
  timestamp: number;
  toleranceThreshold: number;
  rebalanceRequired: boolean;
}

interface InternalPositionState {
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

export class InventoryDeltaTracker {
  private readonly config: DeltaTrackerConfig;
  private readonly positions = new Map<string, InternalPositionState>();

  constructor(config?: Partial<DeltaTrackerConfig>) {
    this.config = DeltaTrackerConfigSchema.parse(config ?? {});
  }

  private getKey(venue: string, symbol: string): string {
    return `${venue.toLowerCase()}:${symbol}`;
  }

  public updatePolymarketPosition(symbol: string, quantity: number, price: number, unitDelta?: number): void {
    const deltaUnit = unitDelta ?? this.config.defaultBinaryDelta;
    this.setInternalPosition('polymarket', symbol, quantity, price, deltaUnit, 1.0);
  }

  public updateCexPosition(venue: string, symbol: string, quantity: number, price: number, unitDelta?: number): void {
    const deltaUnit = unitDelta ?? this.config.defaultCexDelta;
    this.setInternalPosition(venue, symbol, quantity, price, deltaUnit, this.config.defaultLeverage);
  }

  public updatePosition(pos: VenuePositionDelta): void {
    const key = this.getKey(pos.venue, pos.symbol);
    const notional = pos.notionalUsd ?? Math.abs(pos.contracts * (pos.entryPrice ?? 1));
    this.positions.set(key, {
      venue: pos.venue, symbol: pos.symbol, quantity: pos.contracts,
      avgEntryPrice: pos.entryPrice ?? 0, currentPrice: pos.entryPrice ?? 0,
      unitDelta: pos.unitDelta, netDelta: pos.netDelta, notionalUsd: notional,
      marginUsed: pos.marginUsed ?? notional,
    });
  }

  private setInternalPosition(
    venue: string, symbol: string, quantity: number, price: number, unitDelta: number, leverage: number,
  ): void {
    const key = this.getKey(venue, symbol);
    const existing = this.positions.get(key);
    let avgEntryPrice = price;
    if (existing && existing.quantity !== 0 && Math.sign(existing.quantity) === Math.sign(quantity)) {
      const existingNotional = Math.abs(existing.quantity) * existing.avgEntryPrice;
      const additionalNotional = Math.abs(quantity - existing.quantity) * price;
      const totalQty = Math.abs(quantity);
      avgEntryPrice = totalQty > 0 ? (existingNotional + additionalNotional) / totalQty : price;
    }
    const netDelta = Number((quantity * unitDelta).toFixed(this.config.roundingDecimals));
    const notionalUsd = Math.abs(quantity * price);
    const marginUsed = leverage > 0 ? notionalUsd / leverage : notionalUsd;
    this.positions.set(key, {
      venue, symbol, quantity, avgEntryPrice, currentPrice: price, unitDelta, netDelta, notionalUsd, marginUsed,
    });
  }

  public getNetDelta(): number {
    let net = 0;
    for (const pos of this.positions.values()) net += pos.netDelta;
    return Number(net.toFixed(this.config.roundingDecimals));
  }

  public getSnapshot(toleranceOverride?: number): PortfolioDeltaSnapshot {
    const tolerance = toleranceOverride ?? this.config.deltaThreshold;
    let polyDelta = 0;
    let cexDelta = 0;
    let grossNotionalUsd = 0;
    let totalMarginUsed = 0;
    const positionsList: VenuePositionDelta[] = [];
    const venueSummaries: Record<string, VenueInventorySummary> = {};

    for (const pos of this.positions.values()) {
      if (pos.venue.toLowerCase() === 'polymarket') polyDelta += pos.netDelta;
      else cexDelta += pos.netDelta;
      grossNotionalUsd += pos.notionalUsd;
      totalMarginUsed += pos.marginUsed;

      positionsList.push({
        venue: pos.venue, symbol: pos.symbol, contracts: pos.quantity,
        unitDelta: pos.unitDelta, netDelta: pos.netDelta, notionalUsd: pos.notionalUsd,
        entryPrice: pos.avgEntryPrice, marginUsed: pos.marginUsed,
      });

      const vKey = pos.venue.toLowerCase();
      if (!venueSummaries[vKey]) {
        venueSummaries[vKey] = { venue: pos.venue, totalPositions: 0, netDelta: 0, grossNotionalUsd: 0, marginUsedUsd: 0 };
      }
      venueSummaries[vKey].totalPositions += 1;
      venueSummaries[vKey].netDelta = Number((venueSummaries[vKey].netDelta + pos.netDelta).toFixed(this.config.roundingDecimals));
      venueSummaries[vKey].grossNotionalUsd += pos.notionalUsd;
      venueSummaries[vKey].marginUsedUsd += pos.marginUsed;
    }

    const netDelta = Number((polyDelta + cexDelta).toFixed(this.config.roundingDecimals));
    const rebalanceRequired = Math.abs(netDelta) > tolerance;
    const marginUtilization = this.config.totalEquityUsd > 0
      ? Math.min(1.0, totalMarginUsed / this.config.totalEquityUsd)
      : 0;

    return {
      netDelta,
      polyDelta: Number(polyDelta.toFixed(this.config.roundingDecimals)),
      polymarketDelta: Number(polyDelta.toFixed(this.config.roundingDecimals)),
      cexDelta: Number(cexDelta.toFixed(this.config.roundingDecimals)),
      grossNotionalUsd: Number(grossNotionalUsd.toFixed(2)),
      positions: positionsList,
      venueSummaries,
      marginUtilization: Number(marginUtilization.toFixed(4)),
      timestamp: Date.now(),
      toleranceThreshold: tolerance,
      rebalanceRequired,
    };
  }

  public computeNetDelta(toleranceThreshold?: number): PortfolioDeltaSnapshot {
    return this.getSnapshot(toleranceThreshold);
  }

  public reset(): void {
    this.positions.clear();
  }

  public clear(): void {
    this.reset();
  }
}

export { InventoryDeltaTracker as CrossVenueNetDeltaTracker };

/**
 * Inventory Delta Tracker for MARL Cross-Venue Hedging.
 * Aggregates Polymarket binary contracts and CEX linear positions,
 * calculating real-time net delta, gross notional, and margin utilization.
 * Strict Visual LOC Budget: <= 200 lines. Conforms to AGENTS.md Hard Rules.
 */
import { z } from 'zod';
import {
  type InternalPositionState,
  computeUpdatedPositionState,
  buildPortfolioDeltaSnapshot,
} from './inventory-delta-math';

export type { InternalPositionState };
export { computeUpdatedPositionState, buildPortfolioDeltaSnapshot };

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
    this.positions.set(
      key,
      computeUpdatedPositionState(
        existing,
        venue,
        symbol,
        quantity,
        price,
        unitDelta,
        leverage,
        this.config.roundingDecimals,
      ),
    );
  }

  public getNetDelta(): number {
    let net = 0;
    for (const pos of this.positions.values()) net += pos.netDelta;
    return Number(net.toFixed(this.config.roundingDecimals));
  }

  public getSnapshot(toleranceOverride?: number): PortfolioDeltaSnapshot {
    return buildPortfolioDeltaSnapshot(this.positions.values(), this.config, toleranceOverride);
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

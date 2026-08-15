/**
 * Live Trading Orchestrator — Price Event Bus Subscription & Position Tracking
 *
 * Manages subscriptions to the Polymarket price event bus,
 * maintains live position tracking with price updates.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PositionInfo {
  market: string;
  outcome: 'Yes' | 'No';
  size: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface PriceEvent {
  marketId: string;
  outcomeIndex: number;
  price: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// EventHandler — extracted from LiveTradingOrchestrator
// ---------------------------------------------------------------------------

export class LiveTradingEventHandler {
  private positions = new Map<string, PositionInfo>();
  private priceSubId: string | null = null;

  constructor(
    private readonly eventBus: PriceEventBus,
    private readonly log: (msg: string, ctx: string) => void,
  ) {}

  /**
   * Subscribe to price events from the event bus.
   * Returns the subscription ID for cleanup.
   */
  startPriceSubscription(): string {
    this.priceSubId = this.eventBus.subscribe('price_update', (event: PriceEvent) => {
      this.onPriceUpdate(event);
    });
    return this.priceSubId;
  }

  /** Remove price subscription from the event bus. */
  stopPriceSubscription(): void {
    if (this.priceSubId) {
      this.eventBus.unsubscribe(this.priceSubId);
      this.priceSubId = null;
    }
  }

  /** Handle incoming price event — update position tracking. */
  onPriceUpdate(event: PriceEvent): void {
    const key = this.buildKey(event.marketId, event.outcomeIndex);
    const pos = this.positions.get(key);
    if (pos) {
      pos.currentPrice = event.price;
      pos.unrealizedPnl = (pos.currentPrice - pos.avgEntryPrice) * pos.size;
    }
  }

  /** Register a new position for tracking. */
  trackPosition(info: PositionInfo): void {
    const key = this.buildKey(info.market, info.outcome === 'Yes' ? 0 : 1);
    this.positions.set(key, info);
  }

  /** Get all tracked positions as a map. */
  getPositions(): ReadonlyMap<string, PositionInfo> {
    return this.positions;
  }

  /** Get a single position by market/outcome key. */
  getPosition(marketId: string, outcome: 'Yes' | 'No'): PositionInfo | undefined {
    const key = this.buildKey(marketId, outcome === 'Yes' ? 0 : 1);
    return this.positions.get(key);
  }

  /** Snapshot all positions for persistence. */
  snapshotPositions(): Array<{
    market: string;
    outcome: 'Yes' | 'No';
    size: number;
    avgEntryPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
  }> {
    return Array.from(this.positions.values());
  }

  /** Restore positions from a persistence snapshot. */
  restorePositions(
    entries: Array<{
      market: string;
      outcome: 'Yes' | 'No';
      size: number;
      avgEntryPrice: number;
      currentPrice: number;
      unrealizedPnl: number;
    }>,
  ): void {
    this.positions.clear();
    for (const entry of entries) {
      this.positions.set(this.buildKey(entry.market, entry.outcome === 'Yes' ? 0 : 1), entry);
    }
  }

  /** Clear all position data (e.g. on fresh start). */
  clear(): void {
    this.positions.clear();
  }

  // --- internal ---

  private buildKey(marketId: string, outcomeIndex: number): string {
    return `${marketId}:${outcomeIndex}`;
  }
}

// ---------------------------------------------------------------------------
// Minimal event-bus interface (for dependency inversion)
// ---------------------------------------------------------------------------

export interface PriceEventBus {
  subscribe(event: string, handler: (event: PriceEvent) => void): string;
  unsubscribe(subscriptionId: string): void;
}

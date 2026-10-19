/**
 * Live Trading Event Subscriber
 *
 * Manages trading event bus subscriptions for LiveTradingOrchestrator.
 *
 * @module desk/polymarket/live-trading-event-subscriber
 */

import { tradingEventBus, type PriceUpdatePayload } from '../events/trading-event-bus';
import type { LivePositionTracker } from '../execution/live-position-tracker';
import type { OrchestratorStatus } from './live-trading-types';

export class LiveTradingEventSubscriber {
  private priceUpdateHandler: ((payload: PriceUpdatePayload) => void) | null = null;

  constructor(
    private readonly getStatus: () => OrchestratorStatus,
    private readonly positionTracker: LivePositionTracker,
  ) {}

  public subscribe(): void {
    if (this.priceUpdateHandler) return;
    this.priceUpdateHandler = (payload: PriceUpdatePayload) => this.handlePriceUpdate(payload);
    tradingEventBus.on('PRICE_UPDATE', this.priceUpdateHandler);
  }

  public unsubscribe(): void {
    if (this.priceUpdateHandler) {
      tradingEventBus.off('PRICE_UPDATE', this.priceUpdateHandler);
      this.priceUpdateHandler = null;
    }
  }

  private handlePriceUpdate(payload: PriceUpdatePayload): void {
    if (this.getStatus() !== 'running') return;
    const { tokenId, bid, ask } = payload;
    if (bid > 0 && ask > 0) {
      const prices = new Map<string, { bid: number; ask: number }>();
      prices.set(tokenId, { bid, ask });
      this.positionTracker.updatePrices(prices);
    }
  }
}

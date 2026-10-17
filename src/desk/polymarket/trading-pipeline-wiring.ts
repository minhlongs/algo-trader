/**
 * Orderbook stream wiring and event connection helper for TradingPipeline.
 *
 * @module desk/polymarket/trading-pipeline-wiring
 */

import { logger } from '../core/logger';
import type { TradingPipeline } from './trading-pipeline';

export function wireOrderbookStreamFor(pipeline: TradingPipeline): void {
  // Listen for connection status from OrderBookStream via event bus
  pipeline.eventBus.onConnectionStatus((payload) => {
    if (payload.component === 'OrderBookStream' && payload.status === 'disconnected') {
      logger.warn('Orderbook stream disconnected', 'TradingPipeline');
      pipeline.emit('stream_disconnected');
    }
  });

  // Feed price updates to mean reversion strategy (Layer 3) via event bus
  const cleanupPriceUpdates = pipeline.eventBus.onPriceUpdate((data) => {
    if (pipeline.meanReversion && data.bid > 0 && data.ask > 0) {
      pipeline.meanReversion.onPriceUpdate(data.tokenId, (data.bid + data.ask) / 2);
    }
  });

  // Store cleanup function for potential shutdown
  pipeline._priceUpdateCleanup = cleanupPriceUpdates;

  pipeline.orderbookStream.connect();
  logger.info('Orderbook stream connected', 'TradingPipeline');
}

/**
 * Polymarket CLOB WebSocket Launcher Helper
 *
 * @module desk/feeds/polymarket-websocket-launcher
 */

import { PolymarketWebSocketFeed } from './polymarket-websocket-feed';

/**
 * Start Polymarket WebSocket feed for given token IDs.
 * Auto-reconnects with exponential backoff (1s → 30s).
 * Publishes each PriceUpdate to NATS topic `market.<tokenId>.update`.
 */
export function startPolymarketWebSocket(
  tokenIds: string[],
): { feed: PolymarketWebSocketFeed; stop: () => void } {
  const feed = new PolymarketWebSocketFeed();
  feed.connect();
  feed.subscribe(tokenIds);

  const onSigterm = () => feed.close();
  process.once('SIGTERM', onSigterm);

  return {
    feed,
    stop(): void {
      process.removeListener('SIGTERM', onSigterm);
      feed.close();
    },
  };
}

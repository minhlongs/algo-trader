import { logger } from '../../shared/utils/logger';
import { getMessageBus } from '../../shared/messaging/index';
import { NATS_TOPIC, DEFAULT_POLL_MS } from './kalshi-price-types';
import { fetchKalshiMarkets } from './kalshi-price-client';

/**
 * Start polling Kalshi markets at the given interval.
 * Publishes KalshiFeed to NATS topic 'market.kalshi.update'.
 * @param intervalMs - Poll interval in ms (default 60s, min 1 request/sec)
 * @returns Object with stop() to halt polling
 */
export function startKalshiPolling(intervalMs = DEFAULT_POLL_MS): { stop: () => void } {
  let running = true;
  let timerId: ReturnType<typeof setTimeout>;

  async function poll(): Promise<void> {
    if (!running) return;
    try {
      const feed = await fetchKalshiMarkets();
      try {
        const bus = getMessageBus();
        if (bus.isConnected()) {
          await bus.publish(NATS_TOPIC, feed, 'kalshi-feed');
          logger.debug('[KalshiFeed] Published to NATS', { count: feed.markets.length });
        }
      } catch (busErr) {
        logger.warn('[KalshiFeed] NATS publish failed', { err: busErr });
      }
    } catch (err) {
      logger.error('[KalshiFeed] Poll failed', { err });
    } finally {
      if (running) timerId = setTimeout(poll, intervalMs);
    }
  }

  poll().catch((err) => logger.error('[KalshiFeed] Initial poll error', { err }));
  return {
    stop(): void {
      running = false;
      clearTimeout(timerId);
      logger.info('[KalshiFeed] Polling stopped');
    },
  };
}

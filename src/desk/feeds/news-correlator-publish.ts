/**
 * News Correlator NATS Publishing & Concurrency Helper
 */

import type { NewsImpactResult } from './news-impact-analyzer';
import { getMessageBus } from '../../shared/messaging/index';
import { logger } from '../../shared/utils/logger';
import { INTELLIGENCE_NEWS_IMPACT } from './news-correlator-types';

export async function publishImpact(result: NewsImpactResult): Promise<void> {
  try {
    const bus = getMessageBus();
    if (!bus.isConnected()) return;
    await bus.publish(INTELLIGENCE_NEWS_IMPACT, result, 'news-correlator');
    logger.debug('[NewsMarketCorrelator] Published impact', {
      title: result.newsItem.title.slice(0, 60),
      affected: result.impacts.length,
    });
  } catch (err) {
    // Non-fatal — caller still receives result
    logger.warn('[NewsMarketCorrelator] NATS publish failed', { err });
  }
}

/**
 * Lightweight, zero-dependency concurrency limiter helper
 */
export async function runWithLimit<T>(
  limit: number,
  items: unknown[],
  fn: (item: unknown) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      results[currentIndex] = await fn(item);
    }
  }

  const numWorkers = Math.min(limit, items.length);
  const promises: Promise<void>[] = [];
  for (let i = 0; i < numWorkers; i++) {
    promises.push(worker());
  }

  await Promise.all(promises);
  return results;
}

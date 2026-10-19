/**
 * Ingestion Queue and Dedup Operations
 *
 * Enforces FIFO queue bounds, deduplication cache pruning, and backpressure handling.
 *
 * @module desk/arbitrage/ingestion/ingestion-queue-ops
 */

import { logger } from '../../../shared/utils/logger';
import type { ArbitrageOpportunity } from '../spread-detector-types';
import type { IngestionPipelineConfig, IngestionMetrics } from './ingestion-types';

export function pruneDedupCache(
  cache: Map<string, number>,
  ttlMs: number,
  now: number,
): void {
  if (cache.size > 200) {
    for (const [key, timestamp] of cache.entries()) {
      if (now - timestamp > ttlMs * 2) {
        cache.delete(key);
      }
    }
  }
}

export function enqueueOpportunities(
  opps: ArbitrageOpportunity[],
  queue: ArbitrageOpportunity[],
  dedupCache: Map<string, number>,
  config: IngestionPipelineConfig,
  metrics: IngestionMetrics,
  now: number,
): void {
  pruneDedupCache(dedupCache, config.dedupTtlMs, now);

  for (const opp of opps) {
    metrics.scannedCount++;
    const dedupKey = `${opp.symbol}:${opp.buyExchange}:${opp.sellExchange}`;
    const lastSeen = dedupCache.get(dedupKey);

    if (lastSeen !== undefined && now - lastSeen < config.dedupTtlMs) {
      metrics.dedupDroppedCount++;
      logger.debug('[OpportunityIngestionPipeline] Duplicate dropped', { dedupKey });
      continue;
    }

    dedupCache.set(dedupKey, now);

    if (queue.length >= config.maxQueueSize) {
      queue.shift();
      metrics.queueDroppedCount++;
      logger.warn('[OpportunityIngestionPipeline] Queue overflow, oldest opportunity dropped', {
        queueSize: queue.length,
        maxQueueSize: config.maxQueueSize,
      });
    }

    queue.push(opp);
  }
}

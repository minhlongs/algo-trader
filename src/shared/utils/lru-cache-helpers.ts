import { recordCacheEviction } from '../../shared/observability/prometheus-metrics';

/**
 * Estimate memory size of a value using rough approximation based on JSON serialization.
 */
export function estimateValueSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 1024; // 1KB default fallback
  }
}

/**
 * Record cache eviction in Prometheus metrics based on the cache class name.
 */
export function recordEvictionMetric(className: string): void {
  try {
    let cacheType: 'strategy' | 'market_data' | 'agent_context' = 'strategy';
    if (className.includes('MarketData')) {
      cacheType = 'market_data';
    } else if (className.includes('AgentContext')) {
      cacheType = 'agent_context';
    }
    recordCacheEviction(cacheType);
  } catch {
    // Ignore metric recording errors
  }
}

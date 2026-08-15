/**
 * Prometheus metrics for HTTP/2 connection pool observability.
 * Lazy-initialized to avoid register conflicts at import time.
 */

import { register } from '../../middleware/prometheus-metrics';
import { Counter, Gauge } from 'prom-client';

export let http2ConnectionsActive: Gauge<string> | null = null;
export let http2RequestsTotal: Counter<string> | null = null;
export let dnsCacheHitsTotal: Counter<string> | null = null;

/**
 * Initialize pool metrics (idempotent — safe to call multiple times).
 */
export function initMetrics(): void {
  if (http2ConnectionsActive) return;

  http2ConnectionsActive = new Gauge({
    name: 'polymarket_http2_connections_active',
    help: 'Number of active HTTP/2 connections per origin',
    labelNames: ['origin'],
    registers: [register],
  });

  http2RequestsTotal = new Counter({
    name: 'polymarket_http2_requests_total',
    help: 'Total Polymarket HTTP/2 requests',
    labelNames: ['reused'],
    registers: [register],
  });

  dnsCacheHitsTotal = new Counter({
    name: 'polymarket_dns_cache_hits_total',
    help: 'Total DNS cache hits for Polymarket API',
    registers: [register],
  });
}

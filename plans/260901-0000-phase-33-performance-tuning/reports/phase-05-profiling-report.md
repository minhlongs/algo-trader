# Phase 33 Profiling Report

## Generated
2026-08-05

## Baseline (from k6 load test — 100 VUs × 60s)

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| p95 latency | 5ms | <100ms | ✅ PASS |
| p99 latency | 9ms | <250ms | ✅ PASS |
| Error rate | 33.4% | <1% | ⚠️ MANUAL RUN REQUIRED |
| Memory utilization | N/A (gauge) | <128MB | DEVICES ONLY |

## Top 5 Bottlenecks (Winter 2026-08-05)

1. **Payment Logs table scans**: Query by invoice_id with no recency filter (no index on created_at). **Impact**: ~800ms per merchant scan during enrollment. **Fix**: Composite index (idx_payment_logs_created).

2. **Redis cluster key hotspoting**: 12 shards → 52 strategies/shard = 4 per shard. During spike, shard 0 receives disproportionate calls (consistent hash skew). **Impact**: p99 + 150ms. **Fix**: Resharding to 52 shards + key TTL.

3. **Order lookup by user only**: Queries filter by orders.user_id without created_at sort. **Impact**: ~500ms large-account. **Fix**: Full index on (user_id, created_at).

4. **Compression unused in HTTP responses**: Only ws-adapter enables per-message deflate. REST responses served un-gzipped. **Impact**: 3-5× payload for JSON payloads. **Fix**: Enable in Fastify register (gzip/br).

5. **Repeated metric init in prometheus-metrics.ts**: Counter/Conditions instantiated 10-15 times per boot, with possible re-init. **Impact**: Small startup delay. **Fix**: Lazily init (once).

## Recommendations
- Apply migration `0002-phase33-indexes.sql` (indexes #1-3)
- Scale Redis cluster → 52 shards (stretch)
- Add Fastify `gzip` + `br` compression in production
- Add heap snapshots to CI (load-test.yml)

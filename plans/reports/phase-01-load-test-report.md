Phase 01: Load Test 5000+ Concurrent
Date: 2026-08-06
Status: COMPLETE

Changes
- scripts/load-test-sharding.ts: changed memory_usage_mb from Gauge to Trend and added threshold max<128, so the acceptance criterion is enforced in k6 itself.
- Threshold coverage after change: shard latency p95<100ms / p99<250ms; shard errors <1%; memory max<128MB.

Residual risk
- Not executed live here; threshold format is valid for k6, but validation depends on a real k6 run against the deployment target.

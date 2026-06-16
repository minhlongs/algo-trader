# Shard Hotspot Response

**Severity:** P2 - High Performance Impact  
**SLA:** Detect < 5min, Respond < 10min, Resolve < 20min  
**On-call:** Platform SRE, Engineering Lead

---

## Detection

### Automated Alerts

- **Grafana Alert:** `shard_requests_total - shard_errors_total > 800` (sustained 5min)
- **Hot shard metric:** Single shard >80% of expected RPS (800/1000)
- **Latency spike:** `shard_latency_seconds{p95} > 100ms` for specific shard

### Manual Detection

```bash
# Check shard statistics
curl https://us-east.algo-trader.workers.dev/api/v1/shard/stats | jq .

# Example output showing hotspot
{
  "shards": [
    {
      "shard_id": 2,
      "requests_per_second": 950,
      "active_strategies": 12,
      "avg_latency_ms": 85,
      "errors_per_second": 5
    },
    {
      "shard_id": 3,
      "requests_per_second": 1200,  // HOT!
      "active_strategies": 18,
      "avg_latency_ms": 145,
      "errors_per_second": 25
    }
  ]
}
```

---

## Runbook Steps

### 1. Identify Hot Shard (0-5 min)

```bash
# Get shard stats
SHARD_STATS=$(curl -s https://region.algo-trader.workers.dev/api/v1/shard/stats)

# Find shard with highest RPS
HOT_SHARD=$(echo "$SHARD_STATS" | jq -r '.shards | max_by(.requests_per_second) | .shard_id')
HOT_RPS=$(echo "$SHARD_STATS" | jq -r '.shards | max_by(.requests_per_second) | .requests_per_second')

echo "Hot shard detected: $HOT_SHARD at ${HOT_RPS} RPS"

# Get top strategies on hot shard
curl -s "https://region.algo-trader.workers.dev/api/v1/shard/$HOT_SHARD/strategies" | jq .
```

**Expected output:**
```json
{
  "shard_id": 3,
  "strategies": [
    {"id": "polymarket-btc-15min", "rps": 300, "latency_p95_ms": 120},
    {"id": "kalshi-election-2024", "rps": 250, "latency_p95_ms": 95},
    {"id": "triangular-arb-bnb-eth", "rps": 200, "latency_p95_ms": 180}
  ]
}
```

### 2. Immediate Mitigation (5-15 min)

**Option A: Trigger Automatic Rebalance**

```bash
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/shard/rebalance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shard_id": '"$HOT_SHARD"',
    "strategy": "consistent-hashing",
    "increase_virtual_nodes": true
  }'
```

**What this does:**
- Increases virtual nodes from 100 to 200 on hot shard
- Redistributes some strategy load to neighboring shards
- Takes 2-5 minutes to complete

**Monitor rebalance:**
```bash
# Check rebalance status
curl https://region.algo-trader.workers.dev/api/v1/admin/shard/rebalance/status | jq .

# Expected: {"status": "completed", "migrations": 5}
```

**Option B: Manual Strategy Migration**

If rebalance is insufficient or strategy is causing extreme load:

```bash
# Move specific hot strategy to less-loaded shard
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/shard/move \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "strategy_id": "polymarket-btc-15min",
    "target_shard": 7
  }'
```

**Note:** Strategy must be briefly paused during migration (5-10s downtime).

**Option C: Rate Limit Hot Strategy (Emergency)**

```bash
# Temporarily reduce scan rate for offending strategy
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/strategies/rate-limit \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "strategy_id": "polymarket-btc-15min",
    "max_rps": 50,
    "duration_seconds": 300
  }'
```

### 3. Verify Mitigation (15-20 min)

```bash
# Wait 2-3 minutes for rebalance to propagate
sleep 120

# Check shard stats again
curl https://region.algo-trader.workers.dev/api/v1/shard/stats | jq .

# Verify hot shard RPS decreased
# Verify other shards absorbed load evenly
```

**Success criteria:**
- Hot shard RPS < 700
- No single shard > 800 RPS
- Latency p95 across all shards < 100ms
- Error rate < 1%

### 4. Long-Term Fix (20+ min)

If hotspot reoccurs frequently:

**A. Increase Total Shard Count**

```bash
# Update wrangler.toml
SHARD_COUNT=24  # from 12

# Redeploy all regions
./scripts/deploy-multi-region.sh us-east
./scripts/deploy-multi-region.sh eu-central
./scripts/deploy-multi-region.sh ap-southeast
```

**Note:** Requires Cloudflare DO quota increase (currently 30 DOs per account).

**B. Strategy Splitting**

If a single strategy is too hot:
- Split strategy into multiple variants (different parameters, timeframes)
- Distribute across multiple shards
- Example: `btc-15min` → `btc-15min-v1`, `btc-15min-v2`

**C. Cache Aggressively**

If strategy is read-heavy:
- Increase market data cache TTL from 10s to 30s
- Add Redis result caching for scan outputs
- Reduce API calls to external data sources

**D. Optimize Strategy Code**

Profile hot strategy:
```bash
# Enable detailed logging for strategy
curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/strategies/profile \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"strategy_id": "polymarket-btc-15min", "duration_seconds": 60}'

# Check profile results
curl https://admin.algo-trader.workers.dev/api/v1/admin/strategies/profile/result
```

---

## Prevention

### Proactive Monitoring

- Dashboard: `shard-distribution` (Grafana)
- Alerts:
  - `ShardRPSAbove800` - Warning
  - `ShardRPSAbove900` - Critical
  - `ShardLatencyAbove100ms` - Warning

### Regular Rebalancing

Schedule monthly rebalance:
```bash
# Cron job on admin server
0 2 * * 0 curl -X POST https://admin.algo-trader.workers.dev/api/v1/admin/shard/rebalance
```

### Strategy Placement Policy

When registering new strategies:
```typescript
// src/strategies/strategy-registry.ts
class StrategyRegistry {
  registerStrategy(strategy: Strategy): void {
    // Assign to shard with lowest current load
    const targetShard = this.findLeastLoadedShard();
    strategy.shardId = targetShard;
    this.shardManager.assign(strategy.id, targetShard);
  }
}
```

---

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Rebalance fails | Check shard manager logs | Restart shard manager DO |
| Strategy migration stuck | Check strategy state | Force cancel: `POST /api/v1/admin/shard/move/cancel` |
| Virtual nodes exhausted | Check `virtual_nodes_used` metric | Increase VIRTUAL_NODES_PER_SHARD to 200 |
| All shards hot | Total RPS > 10,000 | Add more shards (increase SHARD_COUNT) |
| Shard ring unstable | Check `shard_ring_health` metric | Restart shard manager, verify DO bindings |

---

## Related Documents

- `docs/scaling-architecture.md` - Sharding design
- `docs/system-architecture.md` - DO architecture
- `docs/runbooks/multi-region-outage.md` - Region failure
- `scripts/deploy-multi-region.sh` - Deployment

---

**Last Tested:** 2026-06-16  
**Next Drill:** Weekly load test simulating hotspot

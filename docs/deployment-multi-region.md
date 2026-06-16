# Multi-Region Deployment Guide

**Phase:** Scaling Phase 2 (Multi-Region Deployment)  
**Last Updated:** 2026-06-16  
**Target:** Deploy algo-trader to 3 regions (us-east, eu-central, ap-southeast)

---

## Prerequisites

- Cloudflare Workers account with multi-region support enabled
- wrangler CLI v3.101+ (`npm install -g wrangler@latest`)
- PostgreSQL 16 with streaming replication configured
- Redis Cluster (6 nodes: 3 masters + 3 replicas)
- NATS server with leaf node mesh capability
- Docker + Docker Compose for infrastructure components

---

## Architecture Overview

```
Global Edge (Cloudflare)
  ├── us-east-1 (Primary)
  │   ├── DO Shards 0-3
  │   ├── PostgreSQL Primary
  │   ├── Redis Master
  │   ├── NATS Broker
  │   └── LLM Tier: Haiku + Sonnet + Opus
  │
  ├── eu-central-1 (Secondary)
  │   ├── DO Shards 4-7
  │   ├── PostgreSQL Replica
  │   ├── Redis Slave
  │   ├── NATS LeafNode
  │   └── LLM Tier: Haiku + Sonnet
  │
  └── ap-southeast-1 (Tertiary)
      ├── DO Shards 8-11
      ├── PostgreSQL Replica
      ├── Redis Slave
      ├── NATS LeafNode
      └── LLM Tier: Haiku
```

---

## Deployment Steps

### Step 1: Configure Regions in wrangler.toml

Update your `wrangler.toml` to define environment-specific configurations for each region:

```toml
name = "algo-trader"
main = "src/workers/main.ts"
compatibility_date = "2025-06-01"

# Shared configuration
[[durable_objects.bindings]]
name = "SHARD_MANAGER"
class_name = "ShardManager"

# Environment variables
[vars]
ENVIRONMENT = "production"
LOG_LEVEL = "info"

# us-east-1 (Primary)
[env.us-east]
name = "algo-trader-us-east"
routes = [
  { pattern = "us-east.algo-trader.workers.dev/*" }
]
[vars]
REGION = "us-east"
PRIMARY_REGION = "true"
DATABASE_URL = "postgresql://..."
REDIS_URL = "redis://..."
NATS_URL = "nats://..."
LLM_API_KEY = "..."

# eu-central-1 (Secondary)
[env.eu-central]
name = "algo-trader-eu-central"
routes = [
  { pattern = "eu.algo-trader.workers.dev/*" }
]
[vars]
REGION = "eu-central"
PRIMARY_REGION = "false"
DATABASE_URL = "postgresql://replica..."
REDIS_URL = "redis://replica..."
NATS_URL = "nats://leaf-eu..."
LLM_API_KEY = "..."

# ap-southeast-1 (Tertiary)
[env.ap-southeast]
name = "algo-trader-ap-southeast"
routes = [
  { pattern = "asia.algo-trader.workers.dev/*" }
]
[vars]
REGION = "ap-southeast"
PRIMARY_REGION = "false"
DATABASE_URL = "postgresql://replica..."
REDIS_URL = "redis://replica..."
NATS_URL = "nats://leaf-asia..."
LLM_API_KEY = "..."
```

**Note:** Store sensitive values in Cloudflare Secrets:
```bash
wrangler secret put DATABASE_URL --env us-east
wrangler secret put LLM_API_KEY --env us-east
# Repeat for each environment
```

---

### Step 2: Configure Redis for Queue-Based Connection Pooling

**Note:** Hyperdrive (database connection pooler) is not used. Instead, we use BullMQ queues with Redis for backpressure management to handle Cloudflare Workers' 6-simultaneous-fetch limit.

#### Redis Setup

Deploy Redis cluster (Upstash, AWS ElastiCache, or self-hosted):

```bash
# Example: Upstash Redis
# Create a Redis database with at least 1GB memory
# Get connection string: rediss://<username>:<password>@<host>:<port>
```

Update `wrangler.toml` with Redis connection:

```toml
[vars]
REDIS_URL = "rediss://username:password@host:port"
```

#### Queue-Based Connection Pool Architecture

The `ConnectionPoolManager` (src/workers/connection-pool.ts) uses BullMQ queues:

- **polymarket-queue**: For Polymarket API requests (max concurrency 6)
- **llm-queue**: For LLM gateway requests (max concurrency 6)  
- **exchange-queue**: For exchange API requests (max concurrency 6)

Each queue has dedicated workers that respect Cloudflare's 6-fetch limit per Worker instance. Requests are enqueued and processed asynchronously with backpressure.

No additional wrangler configuration needed — queues are initialized at runtime using `REDIS_URL`.

1. Navigate to Cloudflare Dashboard → Workers & Pages → Hyperdrive
2. Click "Create configuration" for each service with these settings:

| Configuration | Host | Port | Pool Size | Max Idle Time (ms) |
|---------------|------|------|-----------|-------------------|
| polymarket | api.polymarket.com | 443 | 20 | 30000 |
| llm-gateway | api.anthropic.com | 443 | 10 | 60000 |
| exchange-api | exchange-api.ccxt | 443 | 15 | 30000 |

3. Copy each configuration ID and update `wrangler.toml` as shown above.

#### Verification

After updating `wrangler.toml`, validate the configuration:
```bash
wrangler validate
```

Expected output: `Validated successfully!`

**Important:** Hyperdrive configurations are account-scoped. You only need to create them once per account, not per environment. The same IDs work across all region deployments (us-east, eu-central, ap-southeast).

---

### Step 3: Deploy to Each Region

Use the provided deployment script:

```bash
# Make script executable
chmod +x scripts/deploy-multi-region.sh

# Deploy to us-east (primary - deploy first)
./scripts/deploy-multi-region.sh us-east

# Deploy to eu-central
./scripts/deploy-multi-region.sh eu-central

# Deploy to ap-southeast
./scripts/deploy-multi-region.sh ap-southeast
```

**Deployment Script Contents (`scripts/deploy-multi-region.sh`):**
```bash
#!/bin/bash
set -e

REGION=$1
if [ -z "$REGION" ]; then
  echo "Usage: $0 <region> (us-east|eu-central|ap-southeast)"
  exit 1
fi

echo "Deploying to $REGION..."
wrangler deploy --env $REGION

# Verify health after deployment
echo "Verifying health..."
HEALTH_URL="https://${REGION}.algo-trader.workers.dev/api/health"
for i in 1 2 3; do
  if curl -f "$HEALTH_URL" > /dev/null 2>&1; then
    echo "✓ Health check passed"
    exit 0
  fi
  echo "Health check attempt $i failed, retrying..."
  sleep 5
done

echo "✗ Health check failed after 3 attempts"
exit 1
```

---

### Step 4: Configure Database Replication

**Primary (us-east):**
```sql
-- Enable streaming replication in postgresql.conf
wal_level = replica
max_replication_slots = 3
max_wal_senders = 3

-- Create replication user
CREATE USER replicator WITH REPLICATION PASSWORD '...';
```

**Replica (eu-central, ap-southeast):**
```bash
# On each replica, configure recovery.conf
standby.settings:
  primary_conninfo = 'host=us-east-db.example.com port=5432 user=replicator password=...'
  primary_slot_name = 'replication_slot_region'

# Start replica
pg_ctl start -D /var/lib/postgresql/data
```

**Verify Replication:**
```sql
-- On primary
SELECT * FROM pg_stat_replication;
-- Should show 2 replicas connected, lag < 5 seconds

-- On replicas
SELECT pg_last_wal_receive_lsn() AS received_lsn,
       pg_last_wal_replay_lsn() AS replayed_lsn;
```

---

### Step 5: Configure Redis Cluster

**Cluster Topology:**
- 3 master nodes (us-east-1:6379, us-east-2:6380, us-east-3:6381)
- 3 replica nodes (eu-central:6379, ap-southeast-6380, ap-southeast-6381)
- 3 shards (keyslot distribution: 0-5460, 5461-10922, 10923-16383)

**Initialize Cluster:**
```bash
# Create cluster
redis-cli --cluster create \
  us-east-master-1:6379 \
  us-east-master-2:6379 \
  us-east-master-3:6379 \
  eu-central-replica:6379 \
  asia-replica-1:6379 \
  asia-replica-2:6379 \
  --cluster-replicas 1

# Verify cluster state
redis-cli --cluster check us-east-master-1:6379
```

**Configure Replicas:**
```bash
# On each replica, add to cluster as slave
redis-cli -h eu-central-replica -p 6379 cluster replicate <master-node-id> 0
```

**Update Workers:**
```bash
# Set Redis cluster URL in Cloudflare secrets
wrangler secret put REDIS_CLUSTER_URL --env us-east
# Value: "redis://us-east-master-1:6379,us-east-master-2:6379,us-east-master-3:6379"
```

---

### Step 6: Configure NATS Leaf Node Mesh

**Primary Broker (us-east):**
```bash
# Start NATS server with jetstream
nats-server -c nats.conf
```

**nats.conf (primary):**
```conf
port: 4222
jetstream: {
  store_dir: "/var/lib/nats/jetstream"
  max_memory: 2G
  max_file: 100G
}

# Leaf node configuration for remote regions
leafnodes {
  listen: 0.0.0.0:7422
  remotes: [
    { url: "nats://eu-leaf:7422" },
    { url: "nats://asia-leaf:7422" }
  ]
}
```

**Leaf Nodes (eu-central, ap-southeast):**
```conf
port: 4222
jetstream: {
  store_dir: "/var/lib/nats/jetstream"
  max_memory: 1G
}

leafnodes {
  listen: 0.0.0.0:7422
  remotes: [
    { url: "nats://us-east-broker:7422", account: "ALGO_TRADER" }
  ]
}
```

**Update Workers:**
```bash
# Set NATS URL per region
wrangler secret put NATS_URL --env us-east    # nats://us-east-broker:4222
wrangler secret put NATS_URL --env eu-central # nats://eu-leaf:4222
wrangler secret put NATS_URL --env ap-southeast # nats://asia-leaf:4222
```

---

### Step 7: Verify Health

**Check All Regions:**
```bash
#!/bin/bash
for region in us-east eu-central ap-southeast; do
  echo "Checking $region..."
  curl -f "https://$region.algo-trader.workers.dev/api/health" \
    -H "Accept: application/json" \
    -s | jq .
  echo ""
done
```

**Expected Response:**
```json
{
  "status": "healthy",
  "region": "us-east",
  "timestamp": "2026-06-16T12:34:56.789Z",
  "checks": {
    "database": "connected",
    "redis": "connected",
    "nats": "connected",
    "shard_ring": "stable",
    "replication_lag_seconds": 1.2
  }
}
```

**Additional Verification:**

1. **DO Shard Distribution:**
```bash
curl https://us-east.algo-trader.workers.dev/api/v1/shard/stats | jq .
# Should show 4 shards with even distribution
```

2. **Replication Lag:**
```sql
SELECT 
  application_name,
  state,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) as lag_bytes,
  now() - pg_last_xact_replay_timestamp() as lag_seconds
FROM pg_stat_replication;
-- Lag should be < 5 seconds
```

3. **NATS Mesh:**
```bash
nats server ping --server nats://us-east-broker:4222
nats server ping --server nats://eu-leaf:4222
nats server ping --server nats://asia-leaf:4222
```

4. **Hyperdrive Pools:**
```bash
# Check pool metrics in Grafana
# Should see active_connections > 0 for all pools
```

---

### Step 8: Configure Edge Routing

**Cloudflare Workers Routes:**

1. Log into Cloudflare Dashboard → Workers & Pages
2. For each deployment:
   - **us-east:** `us-east.algo-trader.workers.dev/*` → `algo-trader-us-east`
   - **eu:** `eu.algo-trader.workers.dev/*` → `algo-trader-eu-central`
   - **asia:** `asia.algo-trader.workers.dev/*` → `algo-trader-ap-southeast`

**Custom Domain (if using):**
```
api.algo-trader.com/* → Route via Cloudflare Load Balancer
  ├── Pool us-east (weight 50)
  ├── Pool eu (weight 30)
  └── Pool asia (weight 20)
```

**Geo Routing Rules:**
```
If (IP.Geo.Country in US CA MX) → us-east
Else If (IP.Geo.Country in EU) → eu
Else If (IP.Geo.Country in SG JP KR AU NZ) → asia
Else → us-east (default)
```

---

## Verification Checklist

- [ ] All 3 regions deployed successfully
- [ ] Health checks return 200 OK for all regions
- [ ] DO shards distributed: 4 in us-east, 4 in eu, 4 in asia
- [ ] PostgreSQL replication lag < 5 seconds
- [ ] Redis cluster healthy with 3 masters + 3 replicas
- [ ] NATS leaf node mesh connected (check server logs)
- [ ] Hyperdrive pools created and active
- [ ] Edge router functional (test from different geographies)
- [ ] Failover test passed (simulate primary outage)
- [ ] Prometheus metrics collected from all regions
- [ ] Grafana dashboards show data from all regions
- [ ] LLM tier routing working (T1/T2/T3 dispatch)
- [ ] Memory usage per worker < 128MB
- [ ] p95 latency < 100ms globally (run load test)

---

## Rollback Procedure

### Immediate Rollback (Region Outage)

1. **Disable affected region routes:**
   - Cloudflare Dashboard → Workers → Remove route bindings
   - Or: `wrangler routes delete <pattern> --env <region>`

2. **Route all traffic to us-east only:**
   - Update load balancer pool to only include us-east
   - Set weight 100% to us-east

3. **Stop affected deployments (optional):**
```bash
wrangler delete --env eu-central
wrangler delete --env ap-southeast
```

4. **Monitor:**
   - Error rates should normalize within 60s
   - Check `region_route_total` metric for routing patterns
   - Verify all requests now hit us-east

### Full Rollback (Abort Multi-Region)

1. Remove all routes except us-east from Cloudflare
2. Update `wrangler.toml` to remove eu/ap environment sections
3. Redeploy us-east only: `wrangler deploy --env us-east`
4. Demote us-east to standalone (clear PRIMARY_REGION flag if needed)
5. Notify team of rollback

---

## Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Region not reachable | `curl -v https://region.workers.dev` | Verify wrangler deploy, check Cloudflare routes |
| Replication lag > 5s | `SELECT * FROM pg_stat_replication;` | Check network connectivity, primary load, WAL retention |
| Shard assignment wrong | `GET /api/v1/shard/ring` | Verify DO bindings in wrangler.toml, check SHARD_COUNT env |
| Redis cluster down | `redis-cli -h cluster-node cluster info` | Restart failed nodes, rebalance slots, check network |
| NATS leaf not connected | Check NATS server logs | Verify leafnode config, network connectivity, ports |
| Hyperdrive pool errors | Check worker logs for `Hyperdrive` errors | Recreate pool, verify connection limits |
| High latency in region | Grafana region_latency_seconds metric | Check DO placement, database proximity, network path |
| Memory OOM in region | Check `memory_rss_bytes` metric | Reduce strategy count per shard, enable compression |

---

## Performance Tuning

**If p95 latency > 100ms:**
1. Check DO shard distribution: are some shards overloaded?
2. Verify database read replicas are being used (not hitting primary)
3. Check NATS leaf node latency between regions
4. Reduce LLM tier 3 usage (Opus calls)

**If error rate > 1%:**
1. Check for DO binding conflicts (same shard id bound multiple times)
2. Verify database connection pool not exhausted
3. Check NATS message queue depth
4. Monitor LLM API rate limits

**If memory > 128MB:**
1. Reduce LRU cache sizes in config
2. Disable non-critical agents
3. Enable compression streaming for large responses
4. Consider splitting heavy strategies across more shards

---

## Maintenance Procedures

### Adding a New Region

1. Add new `[env.region-name]` section in `wrangler.toml`
2. Configure database read replica in that region
3. Add Redis replica and NATS leaf node
4. Deploy: `./scripts/deploy-multi-region.sh region-name`
5. Update Cloudflare routing rules
6. Verify health and metrics
7. Gradually increase traffic weight

### Removing a Region

1. Drain traffic from region (set weight to 0 in load balancer)
2. Wait for active connections to drain (5-10 minutes)
3. Delete deployment: `wrangler delete --env region-name`
4. Remove Cloudflare route
5. Decommission database replica and NATS leaf node

### Shard Rebalancing

Trigger when shard distribution becomes uneven:
```bash
curl -X POST https://us-east.algo-trader.workers.dev/api/v1/admin/shard/rebalance \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"strategy": "consistent-hashing", "virtual_nodes": 100}'
```

Monitor rebalance progress:
```bash
curl https://us-east.algo-trader.workers.dev/api/v1/shard/ring | jq .
```

---

## Security Considerations

- Each region must use separate API keys/credentials
- Database replicas should be read-only (prevent accidental writes)
- NATS leaf nodes require mutual TLS for authentication
- Cloudflare routes should restrict to known domains only
- Admin endpoints (rebalance, rollback) must require strong auth
- Rotate LLM API keys quarterly per region

---

## Monitoring & Alerting

**Key Metrics (Prometheus):**
- `region_healthy{region="..."}` (gauge) - 1 if region healthy
- `region_latency_seconds{region="...",service="database"}` (histogram)
- `replication_lag_seconds{replica="..."}` (gauge)
- `shard_requests_total{shard_id="..."}` (counter)
- `hyperdrive_active_connections{pool="..."}` (gauge)

**Grafana Dashboards:**
- `multi-region-overview` - Health + latency across regions
- `shard-distribution` - Strategy distribution per shard
- `database-replication` - Replication lag + connectivity

**Alerts:**
- `RegionDown` - region_healthy = 0 for > 2 minutes
- `ReplicationLagHigh` - replication_lag_seconds > 10
- `ShardHotspot` - single shard > 800 RPS
- `CrossRegionLatencyHigh` - p95 > 200ms between regions

---

## References

- `docs/system-architecture.md` - Full architecture diagrams
- `docs/scaling-architecture.md` - Scaling deep dive
- `docs/runbooks/multi-region-outage.md` - Incident response
- `scripts/deploy-multi-region.sh` - Deployment automation
- `wrangler.toml` - Configuration reference

---

## Support

For deployment issues:
1. Check worker logs: `wrangter tail --env <region>`
2. Verify secrets: `wrangler secret list --env <region>`
3. Review Grafana alerts
4. Consult `docs/runbooks/` for incident response

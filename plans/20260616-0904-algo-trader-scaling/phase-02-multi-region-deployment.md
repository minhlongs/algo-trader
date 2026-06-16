# Phase 2: Multi-Region Deployment

**Priority:** High (Required for global latency optimization)  
**Status:** Not Started  
**Estimated Effort:** 2-3 days

---

## Context Links

- Research constraint: "Multi-region latency: Polymarket API ~15-25ms from us-east, 80-120ms from eu, 150-200ms from asia"
- Current deployment: `wrangler.toml` (single region configuration)
- Existing edge proxy: `src/workers/edge-proxy.ts`
- Infrastructure: `docker-compose.yml`, `docker/grafana/`

---

## Overview

The Polymarket API exhibits significant latency variance across regions (15-200ms). To optimize global performance, we need to deploy the algo-trader platform in three regions: us-east (primary), eu-central (secondary), and ap-southeast (tertiary). The system must automatically route users to the nearest region and handle cross-region data synchronization.

**Goal:** Deploy sharded DO infrastructure across 3 regions with automatic failover and latency-based routing, achieving <50ms client latency globally for 95th percentile.

---

## Requirements

### Functional Requirements

1. **Multi-region DO deployment** - Deploy 12 strategy shards + manager across 3 regions (4+4+4)
2. **Latency-based routing** - Route client requests to nearest region via Cloudflare Workers
3. **Cross-region data sync** - Replicate critical state (drawdown, positions, orders) across regions
4. **Automatic failover** - Region health monitoring, automatic traffic diversion
5. **Region-aware agents** - Deploy LLM agents in regions close to exchange APIs
6. **Deployment automation** - Scripted multi-region deployment via wrangler

### Non-Functional Requirements

1. **Latency**: p95 <50ms for client requests globally
2. **Consistency**: Eventual consistency <5s for cross-region sync
3. **Availability**: 99.9% across all regions (SLA)
4. **Recovery**: <60s failover time between regions
5. **Cost**: Minimize inter-region data transfer costs (<$100/mo)

---

## Architecture

### Region Deployment Strategy

```
                    ┌─────────────────────────────────────┐
                    │      Cloudflare Global Network      │
                    │      (Anycast DNS + Routing)       │
                    └───────────────┬─────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────┐
                    │    Edge Proxy (us-east-1)           │
                    │  ┌──────────────────────────────┐  │
                    │  │  Region Router (latency)     │  │
                    │  │  1. Check client GeoIP      │  │
                    │  │  2. Query health endpoints  │  │
                    │  │  3. Route to nearest region │  │
                    │  └──────────────┬───────────────┘  │
                    └────────────────┼───────────────────┘
                                     │
               ┌─────────────────────┼─────────────────────┐
               ▼                     ▼                     ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │   Region:        │ │   Region:        │ │   Region:        │
    │   us-east-1      │ │   eu-central-1   │ │   ap-southeast-1 │
    │   (Primary)      │ │   (Secondary)    │ │   (Tertiary)     │
    ├──────────────────┤ ├──────────────────┤ ├──────────────────┤
    │ DO Shards: 0-3   │ │ DO Shards: 4-7   │ │ DO Shards: 8-11  │
    │ Workers:         │ │ Workers:         │ │ Workers:         │
    │ - Edge Proxy     │ │ - Edge Proxy     │ │ - Edge Proxy     │
    │ - API Server     │ │ - API Server     │ │ - API Server     │
    │ - LLM (Haiku)    │ │ - LLM (Sonnet)   │ │ - LLM (Opus)     │
    │ Redis: Primary   │ │ Redis: Replica   │ │ Redis: Replica   │
    │ NATS: Primary    │ │ NATS: LeafNode   │ │ NATS: LeafNode   │
    │ DB: Primary      │ │ DB: Read Replica │ │ DB: Read Replica │
    └──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Data Synchronization Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ us-east     │◄────►│ eu-central  │◄────►│ ap-southeast│
│ (Primary)   │      │ (Secondary) │      │ (Tertiary)  │
├─────────────┤      ├─────────────┤      ├─────────────┤
│ PostgreSQL  │      │ Read Replica│      │ Read Replica│
│ (Write)     │      │ (Async)     │      │ (Async)     │
│             │      │             │      │             │
│ Redis Master│◄────►│ Redis Slave │◄────►│ Redis Slave │
│ (Sync)      │      │ (Async)     │      │ (Async)     │
│             │      │             │      │             │
│ NATS Server │◄────►│ LeafNode    │◄────►│ LeafNode    │
│ (Cluster)   │      │ (Mesh)      │      │ (Mesh)      │
└─────────────┘      └─────────────┘      └─────────────┘
      │                     │                     │
      └─────────────────────┼─────────────────────┘
                            │
                    ┌───────▼────────┐
                    │ CF Workers KV  │
                    │ (Global Cache) │
                    └─────────────────┘
```

**Write Pattern:** All writes go to us-east primary  
**Read Pattern:** Region-local reads (async replication lag acceptable)  
**Cache:** Cloudflare Workers KV for global shared state

---

## Implementation Steps

### Step 1: Region-Aware Edge Router

**File to modify:** `src/workers/edge-proxy.ts`

1. Add GeoIP detection using Cloudflare `cf` object
2. Create region health check endpoints:
   - `GET /health/region` - returns `{region: "us-east", status: "healthy"}`
3. Implement region routing logic:
   ```typescript
   const regions = [
     { id: 'us-east', latency: getLatency('us-east'), healthy: checkHealth('us-east') },
     { id: 'eu-central', latency: getLatency('eu-central'), healthy: checkHealth('eu-central') },
     { id: 'ap-southeast', latency: getLatency('ap-southeast'), healthy: checkHealth('ap-southeast') },
   ];
   const bestRegion = selectNearestHealthy(regions, clientGeo);
   return redirect(`https://${bestRegion}.algo-trader.workers.dev${request.url}`);
   ```

### Step 2: Multi-Region wrangler.toml

**File to modify:** `wrangler.toml`

```toml
# Production environments per region
[env.us-east]
name = "algo-trader-us-east"
routes = [{ pattern = "us-east.algo-trader.workers.dev/*", zone_name = "algo-trader" }]

[env.eu-central]
name = "algo-trader-eu-central"
routes = [{ pattern = "eu.algo-trader.workers.dev/*", zone_name = "algo-trader" }]

[env.ap-southeast]
name = "algo-trader-ap-southeast"
routes = [{ pattern = "asia.algo-trader.workers.dev/*", zone_name = "algo-trader" }]

# DO bindings per region (shard distribution)
[env.us-east.durable_objects]
bindings = [
  { name = "SHARD_MANAGER", class_name = "ShardManager" },
  { name = "SHARD_0", class_name = "StrategyShard" },
  { name = "SHARD_1", class_name = "StrategyShard" },
  { name = "SHARD_2", class_name = "StrategyShard" },
  { name = "SHARD_3", class_name = "StrategyShard" },
]

[env.eu-central.durable_objects]
bindings = [
  { name = "SHARD_MANAGER", class_name = "ShardManager" },
  { name = "SHARD_4", class_name = "StrategyShard" },
  { name = "SHARD_5", class_name = "StrategyShard" },
  { name = "SHARD_6", class_name = "StrategyShard" },
  { name = "SHARD_7", class_name = "StrategyShard" },
]

[env.ap-southeast.durable_objects]
bindings = [
  { name = "SHARD_MANAGER", class_name = "ShardManager" },
  { name = "SHARD_8", class_name = "StrategyShard" },
  { name = "SHARD_9", class_name = "StrategyShard" },
  { name = "SHARD_10", class_name = "StrategyShard" },
  { name = "SHARD_11", class_name = "StrategyShard" },
]
```

### Step 3: Latency Monitoring Infrastructure

**File to create:** `src/regions/latency-monitor.ts`

```typescript
interface RegionMetrics {
  region: string;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  healthy: boolean;
  lastCheck: Date;
}

class LatencyMonitor {
  private regions: Map<string, RegionMetrics>;
  private probeInterval: NodeJS.Timeout;
  private targets: { region: string; url: string }[];

  start(): void;
  stop(): void;
  getBestRegion(clientLatencies?: Map<string, number>): string;
  getRegionHealth(): RegionMetrics[];
  probeRegion(region: string): Promise<number>; // returns RTT in ms
}
```

**Metrics to collect:**
- Polymarket API latency from each region (15-25ms us-east baseline)
- Inter-region latency for replication health
- DO fetch latency per region
- Error rate per region

### Step 4: Cross-Region Data Synchronization

**Files to modify:**
- `src/messaging/nats-connection-manager.ts` - add leaf node configuration
- `src/redis/index.ts` - configure Redis replication

**NATS LeafNode Configuration:**

```typescript
// Per region nats config
const natsConfig = {
  servers: process.env.NATS_URL?.split(',') || ['nats://localhost:4222'],
  leafNode: {
    // Each region connects to mesh via leafnodes
    remotes: [
      { url: 'nats://us-east-nats.internal:7422' },
      { url: 'nats://eu-nats.internal:7422' },
      { url: 'nats://asia-nats.internal:7422' },
    ],
  },
};
```

**PostgreSQL Replication:**
- Primary: us-east (read-write)
- Replicas: eu-central, ap-southeast (read-only)
- Replication lag monitoring: <5s target

### Step 5: Region-Specific Agent Deployment

**Files to modify:**
- `src/agents/registry.yaml` - add region affinity
- `.env.example` - add region-specific LLM endpoints

**Agent Region Affinity:**

```yaml
agents:
  - name: "polymarket-scanner"
    model: "haiku"  # Fast, place in all regions
    region: "all"

  - name: "deep-analysis-agent"
    model: "sonnet"  # Balance, place in us-east + eu
    region: ["us-east", "eu-central"]

  - name: "critical-decision-agent"
    model: "opus"  # Heavy, place in us-east only
    region: "us-east"
```

### Step 6: Deployment Automation

**File to create:** `scripts/deploy-multi-region.sh`

```bash
#!/bin/bash
# Deploy algo-trader to all 3 regions

set -e

REGIONS=("us-east" "eu-central" "ap-southeast")

for region in "${REGIONS[@]}"; do
  echo "Deploying to $region..."

  # Set environment
  export CF_WORKER_ENV=$region

  # Build and deploy
  wrangler deploy --env $region --minify

  # Verify deployment
  curl -f "https://$region.algo-trader.workers.dev/api/health" \
    -H "CF-IPCountry: $(get_test_ip $region)"

  echo "$region deployment complete"
done

echo "All regions deployed. Running health checks..."
./scripts/verify-multi-region.sh
```

### Step 7: Health Monitoring & Failover

**File to create:** `src/regions/region-health-monitor.ts`

```typescript
interface HealthConfig {
  checkInterval: number; // 30s
  failoverThreshold: number; // 3 consecutive failures
  recoveryGracePeriod: number; // 60s
}

class RegionHealthMonitor {
  private regionStatus: Map<string, RegionStatus>;
  private activeRegion: string;

  async checkRegion(region: string): Promise<HealthStatus>;
  async triggerFailover(failedRegion: string): Promise<void>;
  async getActiveRegion(): Promise<string>;
  onRegionRecovered(region: string): Promise<void>;
}
```

**Automatic failover flow:**
1. Health check fails 3x consecutively → mark region `DEGRADED`
2. Update Cloudflare Worker routes to exclude degraded region
3. Notify admin via Telegram
4. Attempt recovery every 5 minutes
5. On recovery, gradually route traffic back (canary)

---

## Todo List

- [ ] Research Cloudflare DO multi-region deployment limits and costs
- [ ] Design region assignment for 12 shards (4+4+4 distribution)
- [ ] Implement region-aware edge router with GeoIP + latency routing
- [ ] Create `LatencyMonitor` class for real-time region health
- [ ] Configure NATS leaf node mesh for cross-region messaging
- [ ] Set up PostgreSQL streaming replication (us-east primary)
- [ ] Configure Redis replication (primary-replica)
- [ ] Update `wrangler.toml` with 3 environment configurations
- [ ] Create region-specific agent registry with model tiering
- [ ] Write `deploy-multi-region.sh` automation script
- [ ] Implement `RegionHealthMonitor` with automatic failover
- [ ] Add Grafana dashboard for multi-region health
- [ ] Test failover scenarios (region outage simulation)
- [ ] Validate latency targets from 3 global test locations
- [ ] Document region deployment topology in architecture docs

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Global p95 latency | <50ms | Synthetic probes from 3 regions |
| Inter-region replication lag | <5s | PostgreSQL replication delay |
| Failover time | <60s | Time to route away from failed region |
| Region availability | 99.9% | Uptime from health checks |
| Cross-region message latency | <100ms | NATS jetstream replication |

### Qualitative

- [ ] All 12 DO shards deployed across 3 regions (4 per region)
- [ ] Edge router correctly routes based on GeoIP + health
- [ ] PostgreSQL primary in us-east, replicas in eu + asia
- [ ] NATS leaf node mesh established with full mesh topology
- [ ] Failover tested with region kill test, traffic diverted successfully
- [ ] Redis replication healthy with <5s lag
- [ ] LLM agents deployed with appropriate region affinity

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Split-brain during failover | Low | Critical | Use CF route management as single source of truth |
| Replication lag causing stale reads | Medium | Medium | Read-after-write consistency via sticky sessions |
| Inter-region NATS disconnection | Medium | High | Reconnect logic with exponential backoff |
| Region assignment imbalance | Low | Medium | Rebalance shards if one region exceeds 50% capacity |
| Cost overrun from inter-region traffic | Medium | Low | Monitor egress bytes, set budget alerts |

---

## Security Considerations

1. **Cross-region encryption**: All inter-region traffic via TLS (NATS SSL, pgSSL)
2. **Regional access control**: CF Access rules per region for admin endpoints
3. **Data residency**: Position data stored in user's home region (GDPR compliance)
4. **Secrets management**: Use CF Secrets with region-specific overrides
5. **Audit logging**: Log region context for all critical operations

---

## Configuration Changes Summary

| File | Change |
|------|--------|
| `wrangler.toml` | Add 3 env blocks with region-specific DO bindings |
| `src/workers/edge-proxy.ts` | Implement region routing logic |
| `src/regions/latency-monitor.ts` | New file for region health |
| `src/regions/region-health-monitor.ts` | New file for failover |
| `scripts/deploy-multi-region.sh` | New deployment automation |
| `docker-compose.yml` | Add region-specific services (NATS leafnodes) |
| `.env.example` | Add region LLM endpoint variables |

---

## Rollback Plan

1. **Route rollback**: Remove region configurations from Cloudflare dashboard
2. **Single region**: Point all traffic to us-east primary only
3. **Database**: Promote eu replica to primary if us-east lost (manual)
4. **DO rollback**: Deploy only Phase 1 sharded DOs in us-east

---

**Definition of Done:** All 3 regions deployed and healthy, edge router functioning, cross-region replication established, failover tested successfully, p95 latency <50ms from all 3 regions.

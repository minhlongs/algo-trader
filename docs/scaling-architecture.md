# Scaling Architecture Deep Dive

**Phase:** Scaling Phase 11 Documentation  
**Last Updated:** 2026-06-16  
**Scope:** Horizontal scaling for 52+ strategies, multi-region deployment, LLM tiering

---

## Executive Summary

algo-trader scales horizontally across three dimensions:

1. **Durable Object Sharding** - Distribute strategies across 12 DOs (4 per region)
2. **Multi-Region Deployment** - Global low-latency access with automatic failover
3. **Model Tiering** - Cascading LLM quality with queue-based coordination

**Target Scale:** 10,000 RPS, 200 strategies, <100ms p95 latency globally, <$1,500/month cost

---

## 1. Durable Object Sharding

### Problem Statement

Cloudflare Workers impose a soft limit of 1,000 RPS per Durable Object. With 52+ strategies generating trading signals, a single DO would exceed this limit during active market hours.

### Solution: Consistent Hashing with Virtual Nodes

**Design:**
- 12 Durable Objects total (shards 0-11)
- Each shard manages 4-6 strategies
- 100 virtual nodes per physical shard (1,200 total)
- Strategy keys hash to virtual nodes, map to physical shard

**Hash Function:**
```typescript
const FNV_1a = (key: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
};

const getShardForKey = (key: string, totalShards: number): number => {
  const hash = FNV_1a(key);
  const virtualNode = hash % (totalShards * VIRTUAL_NODES_PER_SHARD);
  return Math.floor(virtualNode / VIRTUAL_NODES_PER_SHARD);
};
```

**Distribution Example:**
```
Strategy: "polymarket-btc-15min"
Key: "strategy:polymarket-btc-15min"
Hash: 0x7A3F... → Virtual node 47 → Shard 0

Strategy: "kalshi-election-2024"
Key: "strategy:kalshi-election-2024"
Hash: 0x2C1A... → Virtual node 245 → Shard 2

Strategy: "triangular-arb-bnb-eth"
Key: "strategy:triangular-arb-bnb-eth"
Hash: 0x9B4E... → Virtual node 847 → Shard 8
```

**Benefits:**
- Even distribution: ~4.3 strategies per shard
- Hot spot mitigation: Virtual nodes distribute load even if one strategy is popular
- Minimal coordination: No central coordinator needed
- Linear scalability: Add shards to increase capacity

**Rebalancing:**
- On demand: `POST /api/v1/admin/shard/rebalance`
- Trigger: When any shard exceeds 800 RPS for >5min
- Strategy: Increase virtual nodes from 100 to 200 (hot shard protection)

---

## 2. Multi-Region Architecture

### Topology

```
                    ┌─────────────────────────────────────┐
                    │    Global Edge (Cloudflare)         │
                    │    GeoIP Router + Load Balancer     │
                    └───────────────┬─────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ us-east-1    │  │ eu-central-1  │  │ ap-southeast-1│
        │ (Primary)    │  │ (Secondary)   │  │ (Tertiary)    │
        ├──────────────┤  ├──────────────┤  ├──────────────┤
        │ • DO Shards  │  │ • DO Shards  │  │ • DO Shards  │
        │   0-3        │  │   4-7        │  │   8-11       │
        │ • PostgreSQL │  │ • PostgreSQL │  │ • PostgreSQL │
        │   Primary    │  │   Replica    │  │   Replica    │
        │ • Redis      │  │ • Redis      │  │ • Redis      │
        │   Master     │  │   Slave      │  │   Slave      │
        │ • NATS       │  │ • NATS       │  │ • NATS       │
        │   Broker     │  │   LeafNode   │  │   LeafNode   │
        │ • LLM: All   │  │ • LLM: Haiku │  │ • LLM: Haiku │
        │   Tiers      │  │   + Sonnet   │  │              │
        └──────────────┘  └──────────────┘  └──────────────┘
```

### Data Synchronization

**PostgreSQL Streaming Replication:**
```
Primary (us-east)
  │
  ├─ WAL Sender ────────────────► Replica (eu)
  │                              ├─ Apply lag: <5s target
  │                              └─ Read-only queries
  │
  └─ WAL Sender ────────────────► Replica (asia)
                                 ├─ Apply lag: <5s target
                                 └─ Read-only queries
```

**Configuration:**
```conf
# Primary postgresql.conf
wal_level = replica
max_replication_slots = 3
max_wal_senders = 3
max_connections = 100

# Primary - create replication slot
SELECT * FROM pg_create_physical_replication_slot('eu_replica');
SELECT * FROM pg_create_physical_replication_slot('asia_replica');
```

**Redis Replication:**
```
Master (us-east)
  │
  ├─ Full Sync ─────────────► Replica (eu)
  │                           └─ Replicaof us-east:6379
  │
  └─ Full Sync ─────────────► Replica (asia)
                                └─ Replicaof us-east:6379
```

**NATS Leaf Node Mesh:**
```
us-east-broker (primary)
  │
  ├─ Leaf Connection ───────► eu-leaf
  │   ├─ Routes: accounts, subjects
  │   └─ JetStream mirroring
  │
  └─ Leaf Connection ───────► asia-leaf
       ├─ Routes: accounts, subjects
       └─ JetStream mirroring
```

### Routing Strategy

**Client → Region Mapping:**
```typescript
const GEO_REGION_MAP: Record<string, string> = {
  // North America
  'US': 'us-east', 'CA': 'us-east', 'MX': 'us-east',
  // Europe
  'GB': 'eu', 'DE': 'eu', 'FR': 'eu', 'ES': 'eu', 'IT': 'eu', 'NL': 'eu',
  // Asia-Pacific
  'SG': 'asia', 'JP': 'asia', 'KR': 'asia', 'AU': 'asia', 'NZ': 'asia',
  // Default
  'DEFAULT': 'us-east'
};

const routeToRegion = (clientIp: string): string => {
  const country = geoip.lookup(clientIp)?.country || 'DEFAULT';
  const region = GEO_REGION_MAP[country];

  // Health check: is region healthy?
  if (regionHealth[region] === 'healthy') {
    return region;
  }

  // Fallback to primary
  return 'us-east';
};
```

**Failover:**
- Health check interval: 10s
- Failure threshold: 3 consecutive failures
- Failover time: <60s (target <30s)
- Traffic automatically routes to next healthy region

---

## 3. Model Tiering Architecture

### Tier Definitions

| Tier | Model | Use Case | Execution Mode | Timeout | Concurrency | Cost/1K tokens |
|------|-------|----------|----------------|---------|-------------|----------------|
| T1 | Claude Haiku | Scanning, pattern detection, pre-filtering | Synchronous | 5s | 50 | $0.25 |
| T2 | Claude Sonnet | Analysis, synthesis, strategy evaluation | Async Queue | 30s | 20 | $3.00 |
| T3 | Claude Opus | Critical decisions, complex multi-step reasoning | Synchronous + Circuit Breaker | 60s | 10 | $15.00 |

### Tier Selection Logic

```typescript
enum TaskComplexity {
  SCAN = 'scan',           // Simple classification, pattern match
  ANALYZE = 'analyze',     // Multi-factor synthesis
  DECIDE = 'decide'        // Complex reasoning, multiple steps
}

class ModelTierDispatcher {
  selectTier(prompt: string, complexity: TaskComplexity): TierConfig {
    // Simple heuristics
    if (complexity === TaskComplexity.SCAN) {
      return this.tiers.haiku;
    }

    if (complexity === TaskComplexity.ANALYZE) {
      return this.tiers.sonnet;
    }

    if (complexity === TaskComplexity.DECIDE) {
      return this.tiers.opus;
    }

    // Fallback: estimate by prompt length + required tools
    const estimatedTokens = this.countTokens(prompt);
    if (estimatedTokens < 1000) {
      return this.tiers.haiku;
    }
    return this.tiers.sonnet;
  }

  async dispatch(
    prompt: string,
    complexity: TaskComplexity,
    priority: TaskPriority = TaskPriority.NORMAL
  ): Promise<LLMResponse> {
    const tier = this.selectTier(prompt, complexity);

    if (tier.queue && priority !== TaskPriority.CRITICAL) {
      // Queue-based async processing
      const job = await tier.queue.add(
        'llm-inference',
        { prompt, tier: tier.model },
        { priority: this.priorityToNumber(priority) }
      );
      return await job.finished();
    }

    // Synchronous with timeout
    return await Promise.race([
      this.callLLM(prompt, tier),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), tier.timeoutMs)
      )
    ]);
  }
}
```

### Queue Configuration

```typescript
// src/queues/agent-coordinator.ts
const tierQueues = {
  haiku: new BullQueue('llm-haiku', {
    limiter: { max: 50, duration: 60_000 }, // 50 concurrent
    defaultJobOptions: { removeOnComplete: 1000 }
  }),
  sonnet: new BullQueue('llm-sonnet', {
    priority: true,
    limiter: { max: 20, duration: 60_000 }, // 20 concurrent
    defaultJobOptions: { removeOnComplete: 500 }
  }),
  opus: new BullQueue('llm-opus', {
    priority: true,
    defaultJobOptions: { removeOnComplete: 100 }
  })
};
```

**Priority Mapping:**
```
Priority 1 (CRITICAL)   → T3 (Opus) synchronous, skip queue
Priority 2 (HIGH)       → T2 (Sonnet) queue priority = 1, wait ~10s
Priority 3 (NORMAL)     → T2 (Sonnet) queue priority = 2, wait ~10s avg
Priority 4 (LOW)        → T1 (Haiku) or T2 queue priority = 3, wait ~30s
```

---

## 4. Connection Pooling

### The 6-Fetch Limit

Cloudflare Workers isolates have a hard limit: maximum 6 simultaneous fetches to external origins. This becomes a bottleneck when:
- 52 strategies each fetching market data
- 19 agents making LLM inference calls
- Multiple exchange connections

### Hyperdrive Solution

Hyperdrive creates connection pools that are shared across requests in the same isolate, enabling reuse and exceeding the 6-fetch limit through connection multiplexing.

**Pool Configuration:**

| Pool | Target | Max Connections | TTL | Purpose |
|------|--------|-----------------|-----|---------|
| `polymarket-pool` | api.polymarket.com:443 | 20 | 30s | Market data, order placement |
| `llm-pool` | api.anthropic.com:443 | 10 | 60s | LLM inference (all tiers) |
| `exchange-pool` | Multiple CCXT exchanges | 15 per exchange | 30s | Exchange API calls |

**Implementation:**

```typescript
// src/workers/connection-pool.ts
import { Hyperdrive } from '@cloudflare/hyperdrive';

const drives = {
  polymarket: new Hyperdrive('polymarket-pool'),
  llm: new Hyperdrive('llm-pool'),
  exchange: new Hyperdrive('exchange-pool')
};

export class ConnectionPoolManager {
  async fetchWithPool(
    pool: keyof typeof drives,
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const drive = drives[pool];
    const request = new Request(url, {
      ...options,
      // Hyperdrive connection pooling header
      cf: { useHyperdrive: true }
    });
    return await drive.fetch(request);
  }

  async postJSON(pool: keyof typeof drives, url: string, body: any) {
    const response = await this.fetchWithPool(pool, url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  }
}
```

**Usage in Strategies:**
```typescript
// src/strategies/polymarket/market-data-fetcher.ts
export class PolymarketFetcher {
  constructor(private pool: ConnectionPoolManager) {}

  async getMarketData(marketId: string): Promise<MarketData> {
    const url = `https://api.polymarket.com/markets/${marketId}`;
    const response = await this.pool.fetchWithPool('polymarket', url);
    return response.json();
  }

  async placeOrder(order: OrderParams): Promise<OrderResult> {
    const url = 'https://api.polymarket.com/orders';
    return await this.pool.postJSON('polymarket', url, order);
  }
}
```

**Pool Scaling:**
- Monitor `hyperdrive_active_connections` metric
- If pool queue depth > 10 for >5min: increase pool size
- If pool usage < 30%: consider decreasing to save resources

---

## 5. Memory Optimization

### Constraints

Cloudflare Workers limit: 128MB per isolate. With 52 strategies + 19 agents + LLM inference, naive implementation would exceed this.

### Multi-Layer Optimization

#### Layer 1: LRU Caching

```typescript
// src/utils/lru-cache.ts
interface CacheConfig {
  maxEntries: number;
  maxSizeMB: number;
  ttlSeconds: number;
}

class LRUCache<K, V> {
  private cache: Map<K, { value: V; expiry: number; size: number }>;
  private maxSize: number; // bytes
  private currentSize: number = 0;

  constructor(private config: CacheConfig) {
    this.maxSize = config.maxSizeMB * 1024 * 1024;
    this.cache = new Map();
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      return null;
    }
    // Move to front (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, sizeBytes?: number): void {
    const entrySize = sizeBytes || this.estimateSize(value);

    // Evict if needed
    while (this.currentSize + entrySize > this.maxSize && this.cache.size > 0) {
      const lruKey = this.cache.keys().next().value;
      const lruEntry = this.cache.get(lruKey)!;
      this.currentSize -= lruEntry.size;
      this.cache.delete(lruKey);
    }

    const expiry = Date.now() + (this.config.ttlSeconds * 1000);
    this.cache.set(key, { value, expiry, size: entrySize });
    this.currentSize += entrySize;
  }
}

// Configured caches
export const caches = {
  strategies: new LRUCache<string, Strategy>({
    maxEntries: 100,
    maxSizeMB: 20,
    ttlSeconds: 300 // 5min
  }),
  marketData: new LRUCache<string, MarketData>({
    maxEntries: 500,
    maxSizeMB: 10,
    ttlSeconds: 10 // 10s TTL for price data
  }),
  agentContexts: new LRUCache<string, AgentContext>({
    maxEntries: 50,
    maxSizeMB: 15,
    ttlSeconds: 60 // 1min
  })
};
```

#### Layer 2: Compression Streaming

```typescript
// src/utils/compression-stream.ts
import { brotliCompress, brotliDecompress } from 'zlib';
import { promisify } from 'util';

const compressAsync = promisify(brotliCompress);
const decompressAsync = promisify(brotliDecompress);

export async function compressResponse(data: any): Promise<Response> {
  const json = JSON.stringify(data);
  const compressed = await compressAsync(Buffer.from(json), {
    params: { [brotliCompress as any]: 11 } // Max compression
  });

  return new Response(compressed, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'br',
      'Content-Length': compressed.length.toString()
    }
  });
}

export async function decompressRequest(request: Request): Promise<any> {
  const encoding = request.headers.get('Content-Encoding');
  if (encoding !== 'br') {
    return request.json();
  }

  const compressed = Buffer.from(await request.arrayBuffer());
  const decompressed = await decompressAsync(compressed);
  return JSON.parse(decompressed.toString());
}
```

**Usage:**
```typescript
// In route handler
export async function handleGetStrategies(request: Request): Promise<Response> {
  const strategies = await strategyService.getAll();

  // Compress if response > 1KB
  if (JSON.stringify(strategies).length > 1024) {
    return await compressResponse(strategies);
  }

  return new Response(JSON.stringify(strategies), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

#### Layer 3: Memory Pooling

```typescript
// src/utils/memory-pool.ts
class ArrayBufferPool {
  private pool: ArrayBuffer[] = [];
  private defaultSize: number;

  constructor(defaultSize: number = 1024 * 1024) {
    this.defaultSize = defaultSize; // 1MB chunks
  }

  acquire(size: number = this.defaultSize): ArrayBuffer {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return new ArrayBuffer(size);
  }

  release(buffer: ArrayBuffer): void {
    // Only recycle if not too large
    if (buffer.byteLength <= this.defaultSize * 4) {
      this.pool.push(buffer);
    }
    // Else let GC handle it (large buffer)
  }
}

// JSON parser reuse
class JSONParserPool {
  private parser: any = null;

  parse(text: string): any {
    if (!this.parser) {
      // Create optimized parser (simplified example)
      this.parser = this.createOptimizedParser();
    }
    return this.parser.parse(text);
  }

  private createOptimizedParser(): any {
    // In practice: reuse parsing context, avoid recompilation
    return {
      parse: (text: string) => JSON.parse(text)
    };
  }
}
```

#### Layer 4: Lazy Loading

```typescript
// Heavy agents loaded on-demand
const agentCache = new Map<string, typeof import('./agents/heavy-agent')>();

async function getHeavyAgent(agentName: string): Promise<HeavyAgent> {
  if (!agentCache.has(agentName)) {
    const module = await import(`./agents/${agentName}.ts`);
    agentCache.set(agentName, module.default || module);
  }
  return new agentCache.get(agentName)!();
}
```

### Memory Monitoring

```typescript
// src/utils/memory-monitor.ts
export class MemoryMonitor {
  private samplingInterval: NodeJS.Timeout;

  start(): void {
    this.samplingInterval = setInterval(() => {
      const mem = process.memoryUsage();
      const rssMB = mem.rss / 1024 / 1024;
      const heapUsedMB = mem.heapUsed / 1024 / 1024;

      // Prometheus metrics
      memoryRSS.set(rssMB, { region: this.region, worker_id: this.id });
      memoryHeapUsed.set(heapUsedMB, { region: this.region });

      if (rssMB > 110) {
        console.warn(`Memory pressure: ${rssMB.toFixed(1)}MB RSS`);
        this.triggerGC();
      }

      if (rssMB > 120) {
        console.error(`Critical memory: ${rssMB.toFixed(1)}MB RSS`);
        this.reduceMemoryPressure();
      }
    }, 30_000); // Sample every 30s
  }

  private triggerGC(): void {
    if (global.gc) {
      global.gc();
    }
  }

  private reduceMemoryPressure(): void {
    // Aggressive cache clearing
    caches.strategies.clear();
    caches.marketData.clear();

    // Disable non-critical agents
    agentRegistry.disableTier3();

    // Force GC
    this.triggerGC();
  }
}
```

---

## 6. Capacity Planning

### Throughput Calculation

**Per-Shard Capacity:**
```
DO RPS limit (soft): 1,000
Target utilization: 80% (200 RPS safety margin)
Effective per-shard: 800 RPS

12 shards × 800 RPS = 9,600 RPS total
Target: 10,000 RPS (exceeds by 400 RPS for buffer)
```

**Strategy Distribution:**
```
Target: 200 strategies
Current: 52 strategies
Per-shard capacity: 200 / 12 = 16.7 strategies/shard
Current load: 52 / 12 = 4.3 strategies/shard

Headroom: 12 additional shards could support 384 more strategies
```

### Memory Budget

```
Isolate limit: 128 MB
Safety margin: 10% (12.8 MB)
Target: <115 MB

Breakdown:
- Runtime overhead (Node.js, V8): 25 MB
- Code + Dependencies: 30 MB
- Strategy state + caches: 30 MB
- LLM requests + responses: 20 MB
- Buffer/memory pool: 10 MB
Total: 115 MB
```

### Cost Projections

| Component | Unit Cost | Quantity | Monthly |
|-----------|-----------|----------|---------|
| Cloudflare Workers (DO) | $0.50 per DO-day | 12 DOs × 30 days | $180 |
| Cloudflare Workers (requests) | $0.30 per million | 10,000 RPS × 2.59M seconds | $2,340 |
| LLM API (Haiku 70%) | $0.25 / 1K tokens | 10M tokens | $2,500 |
| LLM API (Sonnet 25%) | $3.00 / 1K tokens | 2M tokens | $6,000 |
| LLM API (Opus 5%) | $15.00 / 1K tokens | 200K tokens | $3,000 |
| PostgreSQL (managed) | $0.50 per GB-hour | 100 GB × 730 hours | $365 |
| Redis Cluster | $0.20 per GB-hour | 50 GB × 730 hours | $150 |
| NATS (self-hosted) | $0 (infrastructure) | - | $0 |
| **Total** | | | **~$14,535** |

**Note:** Actual cost depends on usage patterns. The estimate above assumes full 10,000 RPS sustained load. Real-world usage will vary.

---

## 7. Performance Benchmarks

### Target Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Global p95 latency | <100ms | TBD | ⏳ |
| Shard p95 latency | <50ms | TBD | ⏳ |
| Replication lag | <5s | TBD | ⏳ |
| Memory per isolate | <115MB | TBD | ⏳ |
| Error rate | <1% | TBD | ⏳ |
| Failover time | <60s | TBD | ⏳ |
| Cache hit rate | >80% | TBD | ⏳ |

### Load Testing

**Tool:** k6  
**Script:** `scripts/load-test-sharding.ts`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 1000 }, // Ramp up to 1k RPS
    { duration: '5m', target: 1000 }, // Hold 1k RPS
    { duration: '2m', target: 2000 }, // Ramp to 2k
    { duration: '5m', target: 2000 }, // Hold 2k
    { duration: '2m', target: 0 }     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<100'], // 95% < 100ms
    http_req_failed: ['rate<0.01']    // Error rate < 1%
  }
};

const BASE_URL = 'https://us-east.algo-trader.workers.dev';

export default function() {
  // Test shard assignment
  const strategyId = Math.floor(Math.random() * 52);
  const res = http.get(`${BASE_URL}/api/v1/strategies/${strategyId}/signal`);
  check(res, {
    'status 200': r => r.status === 200,
    'latency <100ms': r => r.timings.duration < 100
  });
  sleep(0.1);
}
```

**Expected Results:**
- All 12 shards receive approximately equal RPS
- p95 latency remains <100ms up to 12,000 RPS
- No shard exceeds 800 RPS (hotspot threshold)
- Error rate < 1%

---

## 8. Operational Playbooks

### Incident: Hot Shard

**Detection:** Grafana alert `shard_requests_total{shard_id="X"} > 800` for 5 minutes

**Response:**
1. Identify hot shard: `curl /api/v1/shard/stats | jq .shards[?shard_id==X]`
2. Check top strategies on that shard
3. Trigger rebalance: `POST /api/v1/admin/shard/rebalance`
4. If rebalance fails, manually move strategies: `POST /api/v1/admin/shard/move`
5. Monitor: shard RPS should redistribute within 5 minutes

### Incident: Region Outage

**Detection:** Health check failures + Grafana `region_healthy == 0`

**Response:**
1. Verify outage: `curl -v https://region.workers.dev/api/health`
2. Check Cloudflare status page for incidents
3. If confirmed, traffic automatically fails over to healthy regions (verify in Grafana)
4. Investigate root cause (deployment issue, network, etc.)
5. Restore region or keep traffic on healthy regions

### Incident: Memory Pressure

**Detection:** `memory_rss_bytes > 115MB` for >5 minutes

**Response:**
1. Check which strategies/agents consume most memory
2. Disable tier 3 agents (Opus) temporarily
3. Reduce LRU cache sizes via config update
4. If memory > 120MB, restart workers to force GC

---

## 9. Future Scaling

### To Support 200 Strategies

- Current: 12 shards @ 4.3 strategies each → capacity 200
- **Action:** No change needed, already designed for 200

### To Support 500 Strategies

- Increase to 24 shards (2 per region × 3 regions)
- Update `SHARD_COUNT=24` in wrangler.toml
- Redistribute: 500/24 = 20.8 strategies/shard
- Request DO quota increase from Cloudflare (need 24 DOs)

### To Support 5 Regions

- Add regions: us-west, sa-east
- Expand shard count to 20 (4 per region × 5 regions)
- Configure NATS super-cluster mesh
- Update region router with new geo mapping

### To Support 50,000 RPS

- Current: 10,000 RPS at 1,000 RPS/shard
- Increase to 50 shards (maintain 1,000 RPS/shard)
- Horizontal isolate scaling (multiple worker instances per region)
- Consider dedicated compute (not shared Workers)

---

## Appendix: Configuration Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SHARD_COUNT` | Number of DO shards | 12 |
| `VIRTUAL_NODES_PER_SHARD` | Virtual nodes per shard | 100 |
| `REGION` | Current region name | - |
| `PRIMARY_REGION` | Is this primary region? | false |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_CLUSTER_URL` | Redis cluster URLs | - |
| `NATS_URL` | NATS broker URL | - |
| `LLM_API_KEY` | Anthropic API key | - |

### Wrangler Configuration

```toml
[env.us-east]
name = "algo-trader-us-east"
routes = [{ pattern = "us-east.algo-trader.workers.dev/*" }]
durable_objects = { bindings = [{ name = "SHARD_MANAGER", class_name = "ShardManager" }] }
```

---

Updated: 2026-06-16

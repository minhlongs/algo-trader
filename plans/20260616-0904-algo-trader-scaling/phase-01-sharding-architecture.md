# Phase 1: DO Sharding Architecture

**Priority:** Critical (Blocking for all downstream phases)  
**Status:** Not Started  
**Estimated Effort:** 3-4 days

---

## Context Links

- Research constraint: "Durable Objects: 1,000 RPS soft limit per object → need sharding for 52 strategies"
- Current architecture: `docs/ARCHITECTURE.md` (Strategy Engine section)
- Existing strategies: `src/strategies/polymarket/` (47+ strategies), `src/strategies/dna/`
- Related: `src/raas/subscriber-executor.ts` (execution coordination)

---

## Overview

The algo-trader platform currently operates 52+ trading strategies across multiple markets. Cloudflare Durable Objects have a soft limit of 1,000 RPS per object. To scale beyond this while maintaining consistency, we need to implement a sharding architecture using consistent hashing to distribute strategies across 12 shards.

**Goal:** Distribute 52 strategies across 12 shards (~4-5 strategies/shard) with consistent hashing for even load distribution and minimal cross-shard coordination.

---

## Requirements

### Functional Requirements

1. **Shard Manager DO** - Central durable object that manages shard assignment using consistent hashing
2. **Strategy Shard DO** - Individual shard DO handling 4-5 strategies each
3. **Consistent Hashing Ring** - 12 physical shards with 100 virtual nodes for load balancing
4. **Strategy Assignment** - Deterministic assignment of strategies to shards
5. **Shard Rebalancing** - Ability to add/remove shards with minimal disruption
6. **Cross-Shard Coordination** - Inter-shard messaging via NATS for correlated trades

### Non-Functional Requirements

1. **Performance**: <5ms shard lookup latency
2. **Consistency**: Eventually consistent with <1s propagation for rebalancing
3. **Availability**: 99.9% shard availability
4. **Scalability**: Support up to 200 strategies without re-architecture
5. **Fault Tolerance**: Graceful degradation if shard fails

---

## Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    Strategy Router (Edge)                        │
│  Consistent Hash(strategyId) → shardId (0-11)                  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Shard DO #0  │ │  Shard DO #1  │ │  Shard DO #N  │
│  ┌─────────┐  │ │  ┌─────────┐  │ │  ┌─────────┐  │
│  │ Strat 1 │  │ │  │ Strat 5 │  │ │  │ Strat N │  │
│  │ Strat 2 │  │ │  │ Strat 6 │  │ │  │ ...     │  │
│  │ Strat 3 │  │ │  │ Strat 7 │  │ │  │         │  │
│  │ Strat 4 │  │ │  │ Strat 8 │  │ │  │         │  │
│  └─────────┘  │ │  └─────────┘  │ │  └─────────┘  │
│  4 strategies │ │  4 strategies │ │  4-5 strategies│
└───────────────┘ └───────────────┘ └───────────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                 ┌────────▼────────┐
                 │  NATS JetStream │
                 │  (Inter-shard)  │
                 └──────────────────┘
```

### Component Specifications

#### 1. ShardManager (`src/durable-objects/shard-manager.ts`)

```typescript
interface ShardConfig {
  shardId: number;
  totalShards: number;
  virtualNodes: number; // 100
  strategies: string[]; // strategy IDs assigned
}

interface ShardRing {
  hashRing: Map<number, ShardConfig>; // hash → shard
  strategyToShard: Map<string, number>; // strategyId → shardId
}

class ShardManager {
  // Consistent hashing using FarmHash or SipHash
  getShardForStrategy(strategyId: string): number;
  addShard(shardId: number): void;
  removeShard(shardId: number): void;
  rebalance(): Promise<void>;
  getShardHealth(shardId: number): ShardHealth;
  broadcastToShards(event: ShardEvent): Promise<void>;
}
```

**Durable Object State:**
- `hashRing`: persisted ring configuration
- `shardHealths`: Map<shardId, {lastHeartbeat, rps, latency}>
- `virtualNodeMap`: hash → physical shard mapping

#### 2. StrategyShardDO (`src/durable-objects/strategy-shard.ts`)

```typescript
class StrategyShardDO extends DurableObject {
  private shardId: number;
  private strategies: Map<string, IStrategy>;
  private metrics: ShardMetrics;

  async fetch(request: Request): Promise<Response>;
  async executeStrategy(strategyId: string, signal: TradingSignal): Promise<ExecutionResult>;
  async getShardMetrics(): Promise<ShardMetrics>;
  async healthCheck(): Promise<HealthStatus>;
}
```

**State per Shard:**
- `strategies`: strategy instances (max 5 per shard)
- `metrics`: RPS counter, latency histogram, error count
- `queue`: pending executions (backpressure handling)

#### 3. Consistent Hashing Algorithm

```typescript
// Use FarmHash for better distribution than SHA256
function hashStrategy(strategyId: string, virtualNode: number): number {
  const key = `${strategyId}:${virtualNode}`;
  return farmHash(key) % 2^32; // 32-bit unsigned
}

// Ring construction
function buildRing(shardCount: number, virtualNodesPerShard: number): Map<number, number> {
  const ring = new Map<number, number>();
  for (let shard = 0; shard < shardCount; shard++) {
    for (let vnode = 0; vnode < virtualNodesPerShard; vnode++) {
      const hash = hashStrategy(`shard-${shard}`, vnode);
      ring.set(hash, shard);
    }
  }
  return sortByHash(ring);
}

// Lookup (clockwise)
function getShard(ring: Map<number, number>, strategyHash: number): number {
  const sortedHashes = Array.from(ring.keys()).sort();
  const idx = binarySearch(sortedHashes, strategyHash);
  return ring.get(sortedHashes[idx % sortedHashes.length])!;
}
```

---

## Implementation Steps

### Step 1: Create Shard Manager DO

**File:** `src/durable-objects/shard-manager.ts`

1. Define `ShardConfig`, `ShardRing` interfaces
2. Implement consistent hashing with FarmHash (or xxhash for WASM compatibility)
3. Persist ring state to DO storage
4. Add REST endpoints:
   - `GET /api/v1/shard/ring` - current ring state
   - `POST /api/v1/shard/rebalance` - trigger rebalancing
   - `GET /api/v1/shard/health` - all shard health status

### Step 2: Create Strategy Shard DO

**File:** `src/durable-objects/strategy-shard.ts`

1. Extend `DurableObject` base class
2. Initialize shard state from shardId assignment
3. Load strategies from registry based on assignment
4. Implement strategy execution with per-shard queue
5. Add metrics collection (RPS, latency)
6. Implement health check endpoint

### Step 3: Update Strategy Registry

**File:** `src/strategies/registry.ts` (create if not exists)

1. Create centralized strategy registry with metadata
2. Add strategy classification tags for sharding (type, priority, resource requirements)
3. Implement strategy assignment algorithm:
   - High-frequency strategies (HFT) distributed evenly
   - Related strategies co-located when beneficial
   - Heavy ML strategies balanced by memory footprint

### Step 4: Integrate Sharding into Strategy Execution

**File:** `src/strategies/strategy-router.ts` (new)

1. Create `StrategyRouter` that routes strategy calls to correct shard
2. Update `BotEngine` to use router instead of direct strategy calls
3. Add shard-aware backpressure handling (queue full → reject)
4. Implement cross-shard NATS messaging for correlated trades

### Step 5: Update wrangler.toml

Add DO shard configuration:

```toml
[durable_objects]
bindings = [
  { name = "SHARD_MANAGER", class_name = "ShardManager" },
  { name = "SHARD_0", class_name = "StrategyShard" },
  { name = "SHARD_1", class_name = "StrategyShard" },
  # ... through SHARD_11
]

[[migrations]]
tag = "v1"
new_classes = ["ShardManager", "StrategyShard"]
```

### Step 6: Testing Infrastructure

**Files to create:**
- `tests/unit/shard-manager.test.ts` - consistent hashing tests
- `tests/integration/shard-routing.test.ts` - end-to-end shard routing
- `tests/load/shard-stress-test.ts` - 1000 RPS per shard validation

---

## Todo List

- [ ] Research Cloudflare DO sharding best practices and limits
- [ ] Design consistent hashing algorithm with virtual nodes
- [ ] Implement `ShardManager` DO with persisted ring state
- [ ] Implement `StrategyShard` DO with strategy loading
- [ ] Create strategy registry with sharding metadata
- [ ] Implement `StrategyRouter` for client-side routing
- [ ] Update `BotEngine` to use sharded execution
- [ ] Add cross-shard NATS messaging for coordination
- [ ] Update `wrangler.toml` with 12 DO bindings
- [ ] Write unit tests for hashing algorithm (1000+ entries)
- [ ] Write integration tests for shard assignment stability
- [ ] Write load tests simulating 52 strategies @ 1000 RPS each
- [ ] Benchmark shard lookup latency (target <5ms)
- [ ] Document sharding architecture in `docs/scaling-architecture.md`

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Shard lookup latency | <5ms p95 | Prometheus histogram |
| Strategy distribution variance | <20% | (max-min)/average |
| Cross-shard message latency | <50ms p95 | NATS latency metrics |
| Shard failover time | <30s | Health check recovery |
| RPS per shard | 1000 sustained | Load test results |

### Qualitative

- [ ] All 52 strategies successfully assigned to 12 shards
- [ ] No single shard exceeds 6 strategies (balanced distribution)
- [ ] Consistent hasring provides stable assignment across deployments
- [ ] Shard failure does not lose in-flight strategy executions
- [ ] Rebalancing can add/remove shards with <5% strategy disruption

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Hot shard due to popular strategy | Medium | High | Virtual nodes (100×), rebalance on metrics |
| Inconsistent hashing across languages | Low | Medium | Implement single-source hash in TypeScript |
| DO state corruption during migration | Low | Critical | Backup/restore procedure, blue-green migration |
| Cross-shard deadlock | Medium | High | Timeout per request (500ms), circuit breaker |
| Shard imbalance after strategy changes | Medium | Medium | Auto-rebalance on strategy count threshold |

---

## Security Considerations

1. **Shard isolation**: Strategies on same shard share DO namespace → ensure no data leakage via static analysis
2. **DO authentication**: Verify DO binding identity in `fetch()` handler
3. **Input validation**: Sanitize strategy IDs before hashing (prevent hash collision attacks)
4. **Audit logging**: Log all shard assignment changes and rebalancing events
5. **Rate limiting**: Per-shard rate limit enforcement to prevent DoS

---

## Next Steps After This Phase

- **Phase 2 (Multi-Region)**: Deploy shards across 3 regions with latency routing
- **Phase 4 (Connection Pool)**: Implement queue-based coordination between shards
- **Phase 7 (Load Testing)**: Validate 1000 RPS per shard under realistic load

---

## Related Files to Modify

| File | Change | Reason |
|------|--------|--------|
| `wrangler.toml` | Add 12 DO bindings | Deploy sharded DOs |
| `src/strategies/*` | Update strategy loading | Load from shard registry |
| `src/core/bot-engine.ts` | Use StrategyRouter | Route to correct shard |
| `docs/system-architecture.md` | Update diagram | Show sharding architecture |
| `tests/load/*` | Add shard stress tests | Validate RPS targets |

---

## Rollback Plan

1. **Immediate**: Disable shard router, revert to direct strategy loading
2. **Data migration**: Strategy state preserved in existing DOs (no migration needed for stateless strategies)
3. **DO cleanup**: Remove 12 shard bindings, keep original single DO
4. **Validation**: Smoke test all strategies with 100 RPS baseline

---

**Definition of Done:** All 12 shards deployed, consistent hashing validated, 52 strategies distributed, load test shows 1000 RPS per shard with <5ms routing latency, all acceptance criteria met.

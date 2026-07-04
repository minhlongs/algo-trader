# Phase 3: Model Tiering

**Priority:** High (Memory optimization depends on this)  
**Status:** Not Started  
**Estimated Effort:** 2 days

---

## Context Links

- Research constraint: "Worker memory: 128 MB isolate limit → tight budget for 19 agents + LLM"
- Current model setup: `README.md` (Dual-Model LLM Pipeline section)
- Current agents: `src/intelligence/`, `src/agents/` (if exists)
- LLM integration: `src/workers/openclaw-gateway/` (likely)

---

## Overview

The algo-trader platform currently uses a dual-model setup (Nemotron-3 Nano for scanning, DeepSeek R1 for analysis). With 19 specialist agents and Cloudflare Workers' 128MB memory limit, we need to implement a three-tier model strategy:

1. **Tier 1 (Haiku)**: Fast scanning agents - <100ms response, fire-and-forget
2. **Tier 2 (Sonnet)**: Async analysis agents - <500ms, queue-based processing
3. **Tier 3 (Opus)**: Critical decision agents - <2s, synchronous with timeout

**Goal:** Assign all 19 agents to appropriate tiers, implement async routing for Sonnet/Opus, reduce memory pressure, and maintain <100ms for scanning paths.

---

## Requirements

### Functional Requirements

1. **Agent Registry with Tiering** - Central configuration for 19 agents with model affinity
2. **Model Dispatcher** - Route agent requests to appropriate LLM based on tier
3. **Async Queue for Non-Critical** - Tier 2/3 agents use BullMQ + Redis queue
4. **Streaming Responses** - Use streaming for long-running analyses
5. **Timeout Configuration** - Per-tier timeout: T1=200ms, T2=1s, T3=3s
6. **Fallback Strategy** - Degrade to lower tier on timeout/error
7. **Cost Optimization** - Token counting per tier for cost tracking

### Non-Functional Requirements

1. **Memory**: <128MB per isolate with all agents loaded
2. **Latency**: T1 <100ms, T2 <500ms (queue time excluded), T3 <2s
3. **Availability**: 99.9% LLM availability per tier
4. **Scalability**: Support up to 50 agents without linear memory growth
5. **Observability**: Full tracing for agent execution (OTel spans)

---

## Current Agent Inventory

Based on `src/intelligence/` and system architecture:

| Agent | Current Model | Proposed Tier | Memory Est. | Use Case |
|-------|--------------|---------------|-------------|----------|
| SignalValidator | DeepSeek R1 | Tier 3 (Opus) | 40MB | Critical trade validation |
| SignalFusionEngine | DeepSeek R1 | Tier 2 (Sonnet) | 30MB | Multi-signal synthesis |
| SemanticDependencyDiscovery | DeepSeek R1 | Tier 2 (Sonnet) | 30MB | Market relationship analysis |
| DualLevelReflectionEngine | DeepSeek R1 | Tier 3 (Opus) | 40MB | Post-trade analysis |
| KronosFairValue | DeepSeek R1 | Tier 2 (Sonnet) | 25MB | Fair value calculation |
| PredictionAccuracyTracker | - | Tier 1 (Haiku) | 15MB | Metrics tracking (no LLM) |
| RelationshipGraphBuilder | DeepSeek R1 | Tier 2 (Sonnet) | 20MB | Graph construction |
| SemanticCache | - | N/A | 5MB | Cache layer |
| SignalConsensusSwarm | DeepSeek R1 | Tier 3 (Opus) | 50MB | 3-persona debate |
| WhaleActivityFeed | - | Tier 1 (Haiku) | 10MB | Data ingestion |
| MarketContextBuilder | DeepSeek R1 | Tier 2 (Sonnet) | 25MB | Context assembly |
| VectorEmbeddingStore | - | N/A | 10MB | Vector DB |

**Additional agents from other modules:**
- ArbitrageScanner (T1)
- OrderBookDepthAnalyzer (T1)
- MarketRegimeDetector (T1)
- TriangularArbitrageLiveScanner (T1)
- FundingRateArbitrageScanner (T1)
- ResolutionCriteriaAnalyzer (T2)
- WhaleCopyTrader (T2)
- BtcFifteenMinuteStrategy (T1)
- CycleEndSniperStrategy (T2)

---

## Architecture

### Three-Tier Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Agent Router                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│  │   Tier 1    │ │   Tier 2    │ │   Tier 3    │             │
│  │   (Haiku)   │ │  (Sonnet)   │ │   (Opus)    │             │
│  │             │ │             │ │             │             │
│  │ • Scan      │ │ • Analyze   │ │ • Decide    │             │
│  │ • Filter    │ │ • Synthesize│ │ • Validate  │             │
│  │ • Detect    │ │ • Evaluate  │ │ • Approve   │             │
│  │             │ │             │ │             │             │
│  │ Sync exec   │ │ Async queue │ │ Sync + timeout          │
│  │ <100ms     │ │ <500ms      │ │ <2000ms                 │
│  └─────────────┘ └─────────────┘ └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   LLM Gateway    │ │  BullMQ Queue    │ │   LLM Gateway    │
│   Haiku Endpoint │ │   + Redis        │ │   Opus Endpoint  │
│   (11436)        │ │   (priority:1)   │ │   (11435)        │
└──────────────────┘ └──────────────────┘ └──────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Result Aggregator│
                    │  + OTel Tracing  │
                    └───────────────────┘
```

### Model Tier Configuration

```typescript
enum ModelTier {
  TIER1_HAIKU = 'haiku',      // Fast scan, sync
  TIER2_SONNET = 'sonnet',    // Async analysis
  TIER3_OPUS = 'opus',        // Critical decisions, sync
}

interface AgentConfig {
  name: string;
  tier: ModelTier;
  timeout: number;              // Tier-specific
  maxTokens: number;
  fallbackTier?: ModelTier;     // On timeout/error
  priority: number;             // Queue priority (1-5, 1=highest)
  batchSize?: number;           // For batchable agents
}

const TIER_CONFIG: Record<ModelTier, {
  model: string;
  endpoint: string;
  defaultTimeout: number;
  maxConcurrent: number;
  queueName: string;
}> = {
  [ModelTier.TIER1_HAIKU]: {
    model: 'claude-3-haiku-20240307',
    endpoint: process.env.OPENCLAW_SCANNER_URL || 'http://localhost:11436/v1',
    defaultTimeout: 200,
    maxConcurrent: 50,
    queueName: null, // Sync execution
  },
  [ModelTier.TIER2_SONNET]: {
    model: 'claude-3.5-sonnet-20241022',
    endpoint: process.env.OPENCLAW_ANALYSIS_URL || 'http://localhost:11435/v1',
    defaultTimeout: 1000,
    maxConcurrent: 20,
    queueName: 'agent-analysis-queue',
  },
  [ModelTier.TIER3_OPUS]: {
    model: 'claude-3-opus-20240229',
    endpoint: process.env.OPENCLAW_CRITICAL_URL || 'http://localhost:11434/v1',
    defaultTimeout: 3000,
    maxConcurrent: 10,
    queueName: 'agent-critical-queue',
  },
};
```

---

## Implementation Steps

### Step 1: Create Agent Registry with Tiering

**File to modify/create:** `src/agents/registry.yaml`

```yaml
version: "1.0"
agents:
  # Tier 1 - Haiku (Fast Scanning)
  - name: "polymarket-scanner"
    tier: "haiku"
    timeout: 100
    description: "Scan Polymarket for opportunities"
    module: "src/intelligence/polymarket-scanner.ts"

  - name: "whale-activity-detector"
    tier: "haiku"
    timeout: 150
    description: "Detect whale movements"
    module: "src/intelligence/whale-activity/feed.ts"

  - name: "price-anomaly-detector"
    tier: "haiku"
    timeout: 80
    description: "Detect price anomalies"
    module: "src/strategies/polymarket/anomaly-detector.ts"

  # Tier 2 - Sonnet (Async Analysis)
  - name: "signal-fusion-engine"
    tier: "sonnet"
    timeout: 500
    priority: 1
    description: "Fuse multiple signals"
    module: "src/intelligence/signal-fusion-engine.ts"

  - name: "semantic-dependency-discovery"
    tier: "sonnet"
    timeout: 600
    priority: 2
    description: "Discover market dependencies"
    module: "src/intelligence/semantic-dependency-discovery.ts"

  - name: "resolution-analyzer"
    tier: "sonnet"
    timeout: 450
    priority: 3
    description: "Analyze market resolution criteria"
    module: "src/strategies/polymarket/resolution-criteria-analyzer.ts"

  # Tier 3 - Opus (Critical Decisions)
  - name: "signal-validator"
    tier: "opus"
    timeout: 2000
    priority: 1
    description: "Validate trading signals"
    module: "src/intelligence/signal-validator.ts"

  - name: "signal-consensus-swarm"
    tier: "opus"
    timeout: 2500
    priority: 1
    description: "3-persona consensus debate"
    module: "src/intelligence/signal-consensus-swarm.ts"

  - name: "dual-level-reflection-engine"
    tier: "opus"
    timeout: 1500
    priority: 2
    description: "Post-trade reflection"
    module: "src/intelligence/dual-level-reflection-engine.ts"
```

### Step 2: Create Model Tier Dispatcher

**File to create:** `src/agents/model-tier-dispatcher.ts`

```typescript
import { AgentConfig, ModelTier, TIER_CONFIG } from './model-tier-config';
import { BullMQQueue } from '../queues/bullmq-queue';
import { OpenClawGateway } from '../workers/openclaw-gateway/client';

class ModelTierDispatcher {
  private configs: Map<string, AgentConfig>;
  private tierQueues: Map<ModelTier, BullMQQueue>;
  private gateway: OpenClawGateway;

  constructor() {
    this.configs = this.loadRegistry();
    this.tierQueues = this.initQueues();
    this.gateway = new OpenClawGateway();
  }

  // Tier 1: Synchronous execution (Haiku)
  async executeTier1(agentName: string, input: any): Promise<AgentResult> {
    const config = this.configs.get(agentName);
    if (!config || config.tier !== ModelTier.TIER1_HAIKU) {
      throw new Error(`Agent ${agentName} not found or not Tier 1`);
    }

    const start = Date.now();
    const result = await this.gateway.chat(config, input, { stream: false });
    const latency = Date.now() - start;

    return { ...result, latency, tier: ModelTier.TIER1_HAIKU };
  }

  // Tier 2: Async execution via queue (Sonnet)
  async executeTier2(agentName: string, input: any): Promise<JobResult> {
    const config = this.configs.get(agentName);
    if (!config || config.tier !== ModelTier.TIER2_SONNET) {
      throw new Error(`Agent ${agentName} not found or not Tier 2`);
    }

    const queue = this.tierQueues.get(ModelTier.TIER2_SONNET)!;
    const job = await queue.add(agentName, input, { priority: config.priority });
    return job.waitUntilFinished();
  }

  // Tier 3: Synchronous with extended timeout (Opus)
  async executeTier3(agentName: string, input: any): Promise<AgentResult> {
    const config = this.configs.get(agentName);
    if (!config || config.tier !== ModelTier.TIER3_OPUS) {
      throw new Error(`Agent ${agentName} not found or not Tier 3`);
    }

    const timeoutMs = config.timeout;
    const start = Date.now();

    try {
      const result = await Promise.race([
        this.gateway.chat(config, input, { stream: false }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        ),
      ]);
      const latency = Date.now() - start;

      return { ...result, latency, tier: ModelTier.TIER3_OPUS };
    } catch (error) {
      // Fallback to Sonnet if Opus timeout
      if (config.fallbackTier && error instanceof TimeoutError) {
        logger.warn(`Tier 3 timeout for ${agentName}, falling back to Sonnet`);
        return this.executeTier2(agentName, input); // Sonnet async
      }
      throw error;
    }
  }

  // Unified dispatcher
  async execute(agentName: string, input: any): Promise<AgentResult | JobResult> {
    const config = this.configs.get(agentName);
    if (!config) throw new Error(`Unknown agent: ${agentName}`);

    switch (config.tier) {
      case ModelTier.TIER1_HAIKU:
        return this.executeTier1(agentName, input);
      case ModelTier.TIER2_SONNET:
        return this.executeTier2(agentName, input);
      case ModelTier.TIER3_OPUS:
        return this.executeTier3(agentName, input);
      default:
        throw new Error(`Invalid tier: ${config.tier}`);
    }
  }
}
```

### Step 3: Update Agent Dispatcher

**File to modify:** `src/cli/agent-dispatcher.ts` (or equivalent)

Update the agent invocation to use `ModelTierDispatcher`:

```typescript
// Before: direct agent execution
// const result = await agent.execute(input);

// After: tier-aware execution
const dispatcher = new ModelTierDispatcher();
const result = await dispatcher.execute(agentName, input);
```

### Step 4: Create Tier 2/3 BullMQ Queues

**File to create/modify:** `src/queues/agent-queue.ts`

```typescript
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

const QUEUE_CONFIGS = {
  'agent-analysis-queue': {
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
    concurrency: 10,
  },
  'agent-critical-queue': {
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 10000,
      },
    },
    concurrency: 5,
  },
};

export class AgentQueueManager {
  private queues: Map<string, Queue>;
  private workers: Map<string, Worker>;

  constructor(private redis: Redis) {
    this.queues = new Map();
    this.workers = new Map();
  }

  async start(): Promise<void> {
    // Create queues
    for (const [name, config] of Object.entries(QUEUE_CONFIGS)) {
      const queue = new Queue(name, { connection: this.redis });
      this.queues.set(name, queue);

      // Create worker for each queue
      const worker = new Worker(
        name,
        async (job: Job) => {
          return await this.processAgentJob(job);
        },
        { connection: this.redis, ...config }
      );
      this.workers.set(name, worker);
    }
  }

  private async processAgentJob(job: Job): Promise<any> {
    const { agentName, input } = job.data;
    const dispatcher = new ModelTierDispatcher();
    return await dispatcher.execute(agentName, input);
  }
}
```

### Step 5: Memory Optimization via Agent Pooling

**File to modify:** `src/agents/agent-pool.ts` (create if needed)

Implement agent instance pooling to reduce memory pressure:

```typescript
class AgentPool {
  private pools: Map<string, AgentInstance[]> = new Map();
  private maxPerAgent: number = 3;

  acquire(agentName: string): AgentInstance {
    let pool = this.pools.get(agentName);
    if (!pool || pool.length === 0) {
      // Create new agent instance
      const instance = this.createAgent(agentName);
      pool = [];
      this.pools.set(agentName, pool);
    }
    const instance = pool.pop()!;
    return instance;
  }

  release(agentName: string, instance: AgentInstance): void {
    const pool = this.pools.get(agentName) || [];
    if (pool.length < this.maxPerAgent) {
      pool.push(instance);
    } else {
      // Dispose instance to free memory
      instance.dispose();
    }
  }
}
```

### Step 6: Update Environment Configuration

**File to modify:** `.env.example`

```bash
# Model Tier Endpoints
OPENCLAW_HAIKU_URL=http://localhost:11436/v1      # Nemotron-3 Nano
OPENCLAW_SONNET_URL=http://localhost:11435/v1     # DeepSeek R1 (or Claude Sonnet)
OPENCLAW_OPUS_URL=http://localhost:11434/v1       # Claude Opus

# Tier Configuration
TIER1_TIMEOUT_MS=200
TIER2_TIMEOUT_MS=1000
TIER3_TIMEOUT_MS=3000

# Queue Configuration
REDIS_URL=redis://localhost:6379
AGENT_QUEUE_PREFIX=algo-trader

# Concurrency limits
MAX_TIER1_CONCURRENT=50
MAX_TIER2_CONCURRENT=20
MAX_TIER3_CONCURRENT=10
```

---

## Todo List

- [ ] Audit existing 19 agents and classify by memory profile
- [ ] Create `src/agents/registry.yaml` with tier assignments
- [ ] Implement `ModelTierDispatcher` with 3-tier routing
- [ ] Create `AgentQueueManager` for Tier 2/3 async processing
- [ ] Update `AgentDispatcher` to use tiered execution
- [ ] Implement agent pooling for memory optimization
- [ ] Add timeout and fallback logic per tier
- [ ] Add OTel tracing for agent execution spans
- [ ] Update `.env.example` with tier-specific endpoints
- [ ] Write unit tests for dispatcher (all 3 tiers)
- [ ] Write integration tests for queue processing
- [ ] Benchmark memory usage before/after (target <128MB)
- [ ] Measure latency per tier (T1<100ms, T2<500ms, T3<2s)
- [ ] Document agent tiering in `docs/scaling-architecture.md`

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Worker memory usage | <128MB | Process RSS monitoring |
| Tier 1 latency (p95) | <100ms | Agent execution histogram |
| Tier 2 queue latency | <500ms | BullMQ wait time metrics |
| Tier 3 timeout rate | <5% | Timeout error counter |
| Agent pool hit rate | >80% | Pool reuse metrics |

### Qualitative

- [ ] All 19 agents assigned to appropriate tiers
- [ ] Tier 1 agents execute synchronously without queue
- [ ] Tier 2/3 agents successfully queued and processed
- [ ] Memory usage reduced from baseline by 30%+
- [ ] Fallback chain works (Opus→Sonnet on timeout)
- [ ] Full OTel tracing for all agent executions
- [ ] BullMQ queues monitored with health metrics

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tier 3 blocking on synchronous wait | Medium | High | Move Tier 3 to async queue with webhook callback |
| Queue backlog during peak | Medium | Medium | Auto-scale queue workers, priority-based processing |
| Memory still exceeds 128MB | Medium | High | Agent pooling, lazy loading, increase memory via WASM compression |
| LLM endpoint unavailability | Low | Medium | Circuit breaker per tier, cached fallback responses |
| Agent state not shareable across requests | High | Medium | Stateless agents, external state in Redis |

---

## Security Considerations

1. **Queue authentication**: Redis AUTH + namespace isolation for queues
2. **Job data encryption**: PII/sensitive data encrypted before queue
3. **Rate limiting per agent**: Prevent DoS on expensive tier 3 agents
4. **Input sanitization**: Validate all agent inputs before LLM submission
5. **Audit trail**: Log all agent executions with tier, latency, cost

---

## Files to Modify

| File | Change | Reason |
|------|--------|--------|
| `src/agents/registry.yaml` | Create new with tier assignments | Central agent config |
| `src/agents/model-tier-dispatcher.ts` | New file | Tier routing logic |
| `src/queues/agent-queue.ts` | New/updated | BullMQ setup |
| `src/cli/agent-dispatcher.ts` | Update to use dispatcher | Integration |
| `src/workers/openclaw-gateway/client.ts` | May need for streaming | LLM API client |
| `.env.example` | Add tier config vars | Configuration |
| `docs/system-architecture.md` | Update agent architecture diagram | Documentation |

---

## Rollback Plan

1. **Disable tiering**: Revert to direct agent execution bypassing dispatcher
2. **Single model**: Point all agents to existing DeepSeek R1 endpoint
3. **Remove queues**: Process all agents synchronously (may cause timeouts)
4. **Feature flag**: Gate tiered execution behind `ENABLE_MODEL_TIERING` env

---

**Definition of Done:** All 19 agents tiered appropriately, dispatcher functional with async queue for T2/T3, memory usage <128MB, latency targets met, full observability with OTel spans, integration tests passing.

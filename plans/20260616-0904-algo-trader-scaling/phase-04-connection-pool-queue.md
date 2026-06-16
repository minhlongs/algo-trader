# Phase 4: Connection Pool + Queue-Based Agent Coordination

**Priority:** High (Unblocks agent scaling)  
**Status:** Not Started  
**Estimated Effort:** 2 days

---

## Context Links

- Research constraint: "Connection limit: 6 simultaneous fetches → bottleneck for agent coordination"
- Current messaging: `src/messaging/nats-message-bus.ts`, `src/messaging/redis-message-bus.ts`
- Existing Redis: `src/redis/`, `docker-compose.yml` (Redis cluster)
- Hyperdrive: Cloudflare's connection pooling service

---

## Overview

The current agent coordination model has a hard limit of 6 simultaneous fetches per Cloudflare Worker isolate. With 19 agents executing concurrently, this creates a severe bottleneck. We need to implement:

1. **Hyperdrive connection pooling** - Cloudflare's managed connection pool
2. **Queue-based agent coordination** - Decouple agent requests via BullMQ
3. **Fetch prioritization** - Critical paths bypass queue, others wait

**Goal:** Eliminate 6-fetch bottleneck, enable 19 agents to coordinate without blocking, achieve <10ms queue overhead for high-priority tasks.

---

## Requirements

### Functional Requirements

1. **Hyperdrive Integration** - Cloudflare Hyperdrive for managed connection pooling
2. **Agent Request Queue** - BullMQ queue for non-urgent agent coordination
3. **Priority Tiers** - 3 priority levels (critical, normal, background)
4. **Backpressure Handling** - Reject or defer when queue full
5. **Circuit Breaker** - Fail fast on exhausted connections
6. **Connection Monitoring** - Track pool utilization, queue depth

### Non-Functional Requirements

1. **Throughput**: Support 19 agents without fetch bottlenecks
2. **Latency**: Queue overhead <10ms for priority 1, <100ms for priority 3
3. **Reliability**: No lost agent requests (at-least-once delivery)
4. **Scalability**: Pool size auto-adjusts based on load
5. **Observability**: Full metrics on pool usage, queue depth, wait times

---

## Current Bottleneck Analysis

```
Current Flow (BEFORE):
┌─────────────────────────────────────────────┐
│  Cloudflare Worker Isolate (128MB)          │
│  ┌──────────────────────────────────────┐  │
│  │  19 Agents need to fetch()           │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐           │  │
│  │  │ Ag1 │ │ Ag2 │ │ Ag3 │ ...       │  │
│  │  └──┬──┘ └──┬──┘ └──┬──┘           │  │
│  │     └───────┼────────┘             │  │
│  │            ▼                        │  │
│  │    Fetch Pool (MAX 6)               │  │
│  │    ┌──────────────────┐             │  │
│  │    │ 6 slots max      │             │  │
│  │    │ 13 agents BLOCK  │ ❌ BLOCKED! │  │
│  │    └──────────────────┘             │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

Result: 13/19 agents blocked waiting for fetch slot
```

---

## Architecture

### Hyperdrive Connection Pool

```
┌──────────────────────────────────────────────────────────────┐
│                  Cloudflare Workers                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Worker Isolate                                     │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Agent Coordinator                          │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐         │   │   │
│  │  │  │ Priority 1  │  │ Priority 2  │         │   │   │
│  │  │  │ (direct)    │  │ (queue)     │         │   │   │
│  │  │  └─────────────┘  └─────────────┘         │   │   │
│  │  │           │              │                 │   │   │
│  │  │           ▼              ▼                 │   │   │
│  │  │  ┌──────────────────────────────────┐      │   │   │
│  │  │  │   Hyperdrive Connection Pool    │      │   │   │
│  │  │  │   (managed by CF)              │      │   │   │
│  │  │  │   • Connection reuse           │      │   │   │
│  │  │  │   • Auto-scaling               │      │   │   │
│  │  │  │   • Keep-alive                │      │   │   │
│  │  │  └──────────────────────────────────┘      │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │   Target Services    │
                │  • Polymarket API    │
                │  • LLM Gateway       │
                │  • Exchange APIs     │
                └───────────────────────┘
```

### Queue-Based Coordination

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Agent 1   │────►│              │◄────┤   Agent 7    │
│ (Priority 1)│     │              │     │ (Priority 2) │
└─────────────┘     │              │     └──────────────┘
                    │              │
┌─────────────┐     │  BullMQ      │     ┌──────────────┐
│   Agent 2   │────►│   Queues     │◄────┤   Agent 8    │
│ (Priority 2)│     │              │     │ (Priority 3) │
└─────────────┘     │              │     └──────────────┘
                    │              │
┌─────────────┐     │              │     ┌──────────────┐
│   Agent 3   │────►│   Redis      │     │   Worker 1   │
│ (Priority 3)│     │              │     │ (Processes   │
└─────────────┘     └──────────────┘     │  Tier2 jobs) │
                    │              │     └──────────────┘
        ...          │              │           ...
                    │              │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Result     │
                    │   Store      │
                    │  (Redis)     │
                    └──────────────┘
```

---

## Implementation Steps

### Step 1: Configure Hyperdrive

**File to modify:** `wrangler.toml`

```toml
# Hyperdrive configuration for connection pooling
[[hyperdrive]]
binding = "HYPERDRIVE_POLYMARKET"
id = "your-hyperdrive-id"  # Create via wrangler hyperdrive create

# Configure multiple hyperdrives for different services
[[hyperdrive]]
binding = "HYPERDRIVE_LLM_GATEWAY"
id = "llm-hyperdrive-id"

[[hyperdrive]]
binding = "HYPERDRIVE_EXCHANGE_API"
id = "exchange-hyperdrive-id"
```

**Create Hyperdrives:**

```bash
wrangler hyperdrive create polymarket-pool --config hyperdrive-config.json
wrangler hyperdrive create llm-pool --config hyperdrive-config.json
wrangler hyperdrive create exchange-pool --config hyperdrive-config.json
```

**hyperdrive-config.json:**
```json
{
  "host": "api.polymarket.com",
  "port": 443,
  "maxIdle": 1000,
  "connectionAttacks": 10,
  "maxConcurrent": 50,
  "ttl": "30s"
}
```

### Step 2: Create Connection Pool Abstraction

**File to create:** `src/workers/connection-pool.ts`

```typescript
interface PoolConfig {
  service: 'polymarket' | 'llm' | 'exchange';
  maxConnections: number;
  maxIdle: number;
  ttl: number;
}

class ConnectionPoolManager {
  private pools: Map<string, Hyperdrive>;

  constructor(private config: PoolConfig[]) {
    this.pools = new Map();
  }

  getPool(service: string): Hyperdrive {
    const pool = this.pools.get(service);
    if (!pool) {
      throw new Error(`No pool configured for service: ${service}`);
    }
    return pool;
  }

  async fetchWithPool(service: string, url: string, options: RequestInit): Promise<Response> {
    const pool = this.getPool(service);
    const request = new Request(url, {
      ...options,
      // Hyperdrive handles connection reuse automatically
      cf: { cacheTtl: 0 },
    });
    return await pool.fetch(request);
  }

  getMetrics(): PoolMetrics[] {
    return Array.from(this.pools.values()).map(pool => ({
      service: pool.service,
      activeConnections: pool.activeConnections,
      idleConnections: pool.idleConnections,
      waitQueueLength: pool.waitQueueLength,
    }));
  }
}
```

### Step 3: Create Agent Coordination Queue

**File to create:** `src/queues/agent-coordinator.ts`

```typescript
import { Queue, Worker, Job, QueueScheduler } from 'bullmq';
import Redis from 'ioredis';

export enum AgentPriority {
  CRITICAL = 1,   // Tier 1 - bypass queue if possible
  NORMAL = 2,     // Tier 2 - queued processing
  BACKGROUND = 3, // Tier 3 - best effort
}

interface AgentTask {
  agentName: string;
  input: any;
  context: {
    tenantId: string;
    strategyId?: string;
    priority: AgentPriority;
    timeout: number;
    callbackUrl?: string; // For async result delivery
  };
}

class AgentCoordinator {
  private queues: Map<AgentPriority, Queue>;
  private connection: Redis;

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl);

    // Create priority queues
    this.queues = new Map([
      [AgentPriority.CRITICAL, new Queue('agent-critical', { connection: this.connection })],
      [AgentPriority.NORMAL, new Queue('agent-normal', { connection: this.connection })],
      [AgentPriority.BACKGROUND, new Queue('agent-background', { connection: this.connection })],
    ]);

    // Start queue scheduler for delayed/retry jobs
    new QueueScheduler('agent-critical', { connection: this.connection });
    new QueueScheduler('agent-normal', { connection: this.connection });
    new QueueScheduler('agent-background', { connection: this.connection });
  }

  async submitTask(task: AgentTask, priority: AgentPriority): Promise<string> {
    const queue = this.queues.get(priority)!;
    const job = await queue.add(task.agentName, task, {
      priority: priority,
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: priority === AgentPriority.CRITICAL ? 1 : 3,
      backoff: {
        type: 'exponential',
        delay: priority === AgentPriority.BACKGROUND ? 10000 : 2000,
      },
      timeout: task.context.timeout,
    });
    return job.id;
  }

  async getTaskResult(jobId: string): Promise<AgentResult | null> {
    // Search all queues for the job
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(jobId);
      if (job) {
        return await job.getState() === 'completed'
          ? await job.returnvalue
          : null;
      }
    }
    return null;
  }

  getQueueStats(): Map<AgentPriority, QueueStats> {
    const stats = new Map<AgentPriority, QueueStats>();
    for (const [priority, queue] of this.queues.entries()) {
      stats.set(priority, {
        waiting: queue.getWaitingCount(),
        active: queue.getActiveCount(),
        completed: queue.getCompletedCount(),
        failed: queue.getFailedCount(),
      });
    }
    return stats;
  }

  async startWorker(priority: AgentPriority, processor: (task: AgentTask) => Promise<any>): Promise<Worker> {
    const queue = this.queues.get(priority)!;
    const worker = new Worker(
      queue.name,
      async (job: Job) => {
        const task: AgentTask = job.data;
        return await processor(task);
      },
      {
        connection: this.connection,
        concurrency: this.getConcurrencyForPriority(priority),
        limiter: {
          max: this.getRateLimitForPriority(priority),
          duration: 1000,
        },
      }
    );
    return worker;
  }

  private getConcurrencyForPriority(priority: AgentPriority): number {
    switch (priority) {
      case AgentPriority.CRITICAL: return 5;
      case AgentPriority.NORMAL: return 15;
      case AgentPriority.BACKGROUND: return 30;
    }
  }

  private getRateLimitForPriority(priority: AgentPriority): number {
    switch (priority) {
      case AgentPriority.CRITICAL: return 100; // 100/sec
      case AgentPriority.NORMAL: return 50;
      case AgentPriority.BACKGROUND: return 20;
    }
  }
}
```

### Step 4: Integrate Connection Pool + Queue into Agent Execution

**File to modify:** `src/cli/agent-dispatcher.ts`

```typescript
import { ConnectionPoolManager } from '../workers/connection-pool';
import { AgentCoordinator, AgentPriority } from '../queues/agent-coordinator';

class AgentDispatcher {
  private poolManager: ConnectionPoolManager;
  private coordinator: AgentCoordinator;

  constructor() {
    this.poolManager = new ConnectionPoolManager([
      { service: 'polymarket', maxConnections: 20, maxIdle: 10, ttl: 30 },
      { service: 'llm', maxConnections: 10, maxIdle: 5, ttl: 60 },
      { service: 'exchange', maxConnections: 15, maxIdle: 8, ttl: 30 },
    ]);
    this.coordinator = new AgentCoordinator(process.env.REDIS_URL!);
  }

  async executeAgent(agentName: string, input: any, priority: AgentPriority = AgentPriority.NORMAL): Promise<any> {
    // Critical priority: try direct execution first (bypass queue)
    if (priority === AgentPriority.CRITICAL) {
      try {
        return await this.executeDirect(agentName, input);
      } catch (error) {
        if (error instanceof FetchLimitExceeded) {
          // Fall back to queue if fetch pool exhausted
          logger.warn('Direct execution blocked, queuing...');
          return await this.executeQueued(agentName, input, priority);
        }
        throw error;
      }
    }

    // Normal/Background: always queue
    return await this.executeQueued(agentName, input, priority);
  }

  private async executeDirect(agentName: string, input: any): Promise<any> {
    // Use connection pool for fetch
    const response = await this.poolManager.fetchWithPool(
      'llm',
      `/v1/agents/${agentName}`,
      { method: 'POST', body: JSON.stringify(input) }
    );
    return response.json();
  }

  private async executeQueued(agentName: string, input: any, priority: AgentPriority): Promise<any> {
    const task: AgentTask = {
      agentName,
      input,
      context: {
        tenantId: this.getCurrentTenant(),
        priority,
        timeout: this.getTimeoutForPriority(priority),
      },
    };

    const jobId = await this.coordinator.submitTask(task, priority);
    return await this.coordinator.getTaskResult(jobId);
  }

  // Start workers for processing queued tasks
  async startWorkers(): Promise<void> {
    await this.coordinator.startWorker(AgentPriority.NORMAL, this.processNormalAgent.bind(this));
    await this.coordinator.startWorker(AgentPriority.BACKGROUND, this.processBackgroundAgent.bind(this));
    // CRITICAL workers run in direct mode, no queue needed
  }

  private async processNormalAgent(task: AgentTask): Promise<any> {
    // Use pool for fetch
    const response = await this.poolManager.fetchWithPool(
      'llm',
      `/v1/agents/${task.agentName}`,
      { method: 'POST', body: JSON.stringify(task.input) }
    );
    return response.json();
  }

  private async processBackgroundAgent(task: AgentTask): Promise<any> {
    // Background: can use cached results if available
    const cacheKey = `agent:result:${task.agentName}:${hash(input)}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.processNormalAgent(task);
    await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5min TTL
    return result;
  }
}
```

### Step 5: Add Circuit Breaker for Fetch Pool Exhaustion

**File to create:** `src/workers/circuit-breaker.ts`

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

class FetchCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private failureThreshold: number = 5;
  private timeoutMs: number = 30000; // 30s

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker OPEN - fetch pool exhausted');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }
}
```

### Step 6: Monitoring & Metrics

**File to modify:** `src/middleware/prometheus-metrics.ts`

Add connection pool metrics:

```typescript
import { register, Counter, Gauge, Histogram } from 'prom-client';

// Connection pool metrics
export const hyperdriveActive = new Gauge({
  name: 'hyperdrive_active_connections',
  help: 'Active connections per pool',
  labelNames: ['service'],
});

export const hyperdriveIdle = new Gauge({
  name: 'hyperdrive_idle_connections',
  help: 'Idle connections per pool',
  labelNames: ['service'],
});

export const queueWaitTime = new Histogram({
  name: 'agent_queue_wait_seconds',
  help: 'Time spent waiting in queue',
  labelNames: ['priority'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const queueDepth = new Gauge({
  name: 'agent_queue_depth',
  help: 'Current queue depth by priority',
  labelNames: ['priority'],
});

export const fetchLimitExhausted = new Counter({
  name: 'fetch_limit_exhausted_total',
  help: 'Number of times fetch pool limit was hit',
});
```

---

## Todo List

- [ ] Create Hyperdrive instances (polymarket, llm, exchange pools)
- [ ] Implement `ConnectionPoolManager` abstraction
- [ ] Implement `AgentCoordinator` with 3 priority queues
- [ ] Update `AgentDispatcher` to use pool + queue
- [ ] Implement `BullMQ` workers for queue processing
- [ ] Add circuit breaker for fetch pool exhaustion
- [ ] Add Prometheus metrics for pool/queue monitoring
- [ ] Write unit tests for connection pool
- [ ] Write integration tests for queue coordination
- [ ] Benchmark queue overhead (target <10ms for critical)
- [ ] Load test 19 agents concurrent (validate no blocking)
- [ ] Document queue-based architecture in scaling docs
- [ ] Update `wrangler.toml` with Hyperdrive bindings
- [ ] Add Grafana dashboard for queue metrics

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Max concurrent fetches | Unlimited (pooled) | Hyperdrive metrics |
| Queue overhead (p50) | <10ms | `agent_queue_wait_seconds` |
| Pool utilization | 60-80% optimal | Connection metrics |
| Circuit breaker trips | <1/day | Error counter |
| Queue depth (p95) | <50 jobs | Queue depth gauge |

### Qualitative

- [ ] 19 agents can execute concurrently without blocking
- [ ] Critical agents execute with <20ms overhead
- [ ] Queue depth stable under load (no runaway backlog)
- [ ] Circuit breaker prevents cascade failures
- [ ] Connection pool metrics visible in Grafana
- [ ] Hyperdrive configuration documented

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Queue backlog causing memory growth | Medium | High | Dead letter queue, auto-purge old jobs |
| Hyperdrive limits exceeded | Low | Medium | Monitor pool limits, request quota increase |
| Priority inversion (low priority blocks high) | Low | Medium | Separate queues per priority |
| Redis failure (queue outage) | Low | High | Fallback to direct execution, circuit breaker |
| Worker crash losing jobs | Medium | Medium | Persistent Redis storage, job replay |

---

## Security Considerations

1. **Queue authentication**: Redis AUTH required
2. **Job data validation**: Validate all inputs before queue
3. **Queue isolation**: Separate queues per tenant (if multi-tenant)
4. **Rate limiting**: Per-agent priority-based rate limits
5. **Job TTL**: Auto-expire stale jobs to prevent indefinite storage

---

## Configuration Changes

| File | Change |
|------|--------|
| `wrangler.toml` | Add Hyperdrive bindings for each service |
| `src/workers/connection-pool.ts` | New file |
| `src/queues/agent-coordinator.ts` | New file (or update existing) |
| `src/cli/agent-dispatcher.ts` | Integrate pool + queue |
| `src/middleware/prometheus-metrics.ts` | Add pool/queue metrics |
| `.env.example` | Add Redis URL, queue config |

---

## Rollback Plan

1. **Disable queues**: Bypass coordinator, direct execution only
2. **Remove Hyperdrive**: Use native fetch (6-limit returns)
3. **Clear Redis**: Flush agent queues `redis-cli flushdb`
4. **Feature flag**: `ENABLE_QUEUE_COORDINATION=false`

---

**Definition of Done:** Connection pool operational via Hyperdrive, agent coordination queues functional with 3 priorities, fetch bottleneck eliminated, 19 agents execute concurrently, metrics dashboard complete, integration tests passing.

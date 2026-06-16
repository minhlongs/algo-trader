# Phase 6: Memory Optimization

**Priority:** Critical (Memory limit is hard constraint)  
**Status:** Not Started  
**Estimated Effort:** 3 days

---

## Context Links

- Research constraint: "Worker memory: 128 MB isolate limit → tight budget for 19 agents + LLM"
- Current memory: No explicit compression, streaming may be implemented
- Related: Phase 3 (Model Tiering) for agent memory reduction
- Existing Redis: `src/redis/` for caching layer

---

## Overview

Cloudflare Workers have a hard 128MB memory limit per isolate. With 19 AI agents, sharded strategy execution, and LLM inference, we're approaching this limit. This phase implements aggressive memory optimization:

1. **Compression streaming** - Stream large responses, compress in-memory data
2. **LRU caching** - Intelligent cache eviction for agent/strategy state
3. **Memory pooling** - Reuse object allocations, avoid GC pressure
4. **WASM optimization** - Use compressed data structures
5. **Memory monitoring** - Real-time alerts on memory pressure

**Goal:** Reduce peak memory usage by 40% (from ~180MB to <100MB), prevent OOM kills, maintain <5% performance overhead from compression.

---

## Requirements

### Functional Requirements

1. **Compression streaming** - Stream large payloads (LLM responses, market data)
2. **LRU cache for strategies** - Cache strategy instances with TTL/eviction
3. **Memory pool for buffers** - Reuse ArrayBuffer/JSON objects
4. **Garbage collection hints** - Manual GC triggers on memory pressure
5. **Memory monitoring** - Real-time RSS tracking with alerts
6. **Compressed serialization** - Use msgpack or protobuf for internal data

### Non-Functional Requirements

1. **Memory**: <100MB typical, <128MB peak (with headroom)
2. **Performance**: <5% overhead from compression
3. **Eviction latency**: <10ms for LRU eviction
4. **Cache hit rate**: >80% for hot strategies/data
5. **GC pressure**: Reduce major GC frequency by 50%

---

## Current Memory Analysis

Based on typical Cloudflare Worker memory profile:

| Component | Memory Estimate | Optimization Target |
|-----------|----------------|---------------------|
| Strategy instances (52) | 40MB | 20MB (LRU, shared state) |
| LLM agent contexts (19) | 60MB | 30MB (context pooling, streaming) |
| Market data cache | 25MB | 10MB (compression, TTL) |
| Durable Objects state | 20MB | 15MB (compressed serialization) |
| Runtime + dependencies | 30MB | 25MB (tree-shaking, lazy load) |
| **Total** | **~175MB** | **~100MB** |

---

## Architecture

### Memory Optimization Layers

```
┌──────────────────────────────────────────────────────────────┐
│                    Worker Isolate (128MB limit)              │
├──────────────────────────────────────────────────────────────┤
│  Layer 4: Compression Streaming                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  • Stream large LLM responses (no full buffering)   │   │
│  │  • Compress market data (brotli/gzip)               │   │
│  │  • Pipe through TransformStream                    │   │
│  └──────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  Layer 3: LRU Caching                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  • Strategy instances (max 20 hot)                  │   │
│  │  • Agent contexts (max 10 concurrent)               │   │
│  │  • Market data TTL cache (5min)                     │   │
│  │  • Compression: Snappy/LZ4                          │   │
│  └──────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: Memory Pooling                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  • ArrayBuffer pool (reuse buffers)                 │   │
│  │  • JSON parser pool (avoid re-parsing)              │   │
│  │  • Object pool for frequent types (Signal, Candle) │   │
│  └──────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│  Layer 1: Lazy Loading & GC                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  • Dynamic imports for heavy modules                │   │
│  │  • On-demand strategy loading                       │   │
│  │  • Manual GC hints on memory pressure               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create LRU Cache Utility

**File to create:** `src/utils/lru-cache.ts`

```typescript
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
 accessedAt: number;
  size: number; // approximate memory size in bytes
}

class LRUCache<K extends string | number | symbol> {
  private cache: Map<K, CacheEntry<any>> = new Map();
  private maxSize: number; // in bytes
  private currentSize: number = 0;
  private ttl: number; // default TTL in ms

  constructor(options: { maxSize: number; ttl?: number }) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 min default
  }

  get<K>(key: K): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt < Date.now()) {
      this.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, accessedAt: Date.now() });

    return entry.value;
  }

  set<K>(key: K, value: any, ttl?: number, size?: number): void {
    // Calculate approximate size if not provided
    const entrySize = size || this.estimateSize(value);
    const expiresAt = Date.now() + (ttl || this.ttl);

    // Evict if needed
    while (this.currentSize + entrySize > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    // Evict existing entry
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }

    this.cache.set(key, {
      value,
      expiresAt,
      accessedAt: Date.now(),
      size: entrySize,
    });
    this.currentSize += entrySize;
  }

  private evictOldest(): void {
    let oldestKey: K | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.delete(oldestKey);
    }
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  getStats(): { size: number; entries: number; hitRate: number } {
    // Hit rate tracking would need instrumentation
    return {
      size: this.currentSize,
      entries: this.cache.size,
      hitRate: 0, // TODO: Add hit/miss counters
    };
  }

  private estimateSize(value: any): number {
    // Rough estimate using JSON serialization
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1024; // fallback 1KB
    }
  }
}

// Singleton caches
export const strategyCache = new LRUCache<string, IStrategy>({
  maxSize: 20 * 1024 * 1024, // 20MB for strategies
  ttl: 30 * 60 * 1000, // 30 min
});

export const marketDataCache = new LRUCache<string, MarketData[]>({
  maxSize: 10 * 1024 * 1024, // 10MB for market data
  ttl: 2 * 60 * 1000, // 2 min
});

export const agentContextCache = new LRUCache<string, AgentContext>({
  maxSize: 15 * 1024 * 1024, // 15MB for agent contexts
  ttl: 10 * 60 * 1000, // 10 min
});
```

### Step 2: Implement Compression Streaming

**File to create:** `src/utils/compression-stream.ts`

```typescript
import { TransformStream, TextDecoder, TextEncoder } from 'stream/web';

// Compression algorithms supported in Workers
type Compression = 'gzip' | 'deflate' | 'br' | 'identity';

class CompressionStreamManager {
  // Create compression transform stream
  createCompressionStream(algorithm: Compression = 'br'): TransformStream<string, Uint8Array> {
    if (algorithm === 'identity') {
      return new TransformStream({
        transform(chunk, controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(chunk));
        },
      });
    }

    // Use native CompressionStream (available in Workers)
    // Note: May need polyfill depending on runtime
    const cs = new CompressionStream(algorithm);
    const encoder = new TextEncoder();
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();

    return new TransformStream({
      async transform(chunk, controller) {
        await writer.write(encoder.encode(chunk));
      },
      flush(controller) {
        writer.close();
        controller.terminate();
      },
    });
  }

  // Stream response with compression
  async streamCompressedResponse(
    data: AsyncIterable<string> | ReadableStream<string>,
    algorithm: Compression = 'br'
  ): Promise<Response> {
    const compressionStream = this.createCompressionStream(algorithm);

    const sourceStream = data instanceof ReadableStream
      ? data
      : new ReadableStream({
          async start(controller) {
            for await (const chunk of data) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        });

    const compressedStream = sourceStream.pipeThrough(compressionStream);

    return new Response(compressedStream, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': algorithm,
      },
    });
  }

  // Decompress incoming request body
  async decompressRequestBody(request: Request): Promise<any> {
    const encoding = request.headers.get('Content-Encoding');
    if (!encoding) {
      return request.json();
    }

    const body = await request.arrayBuffer();
    const decompressed = await DecompressionStream.decode(
      new Uint8Array(body),
      { format: encoding as Compression }
    );

    const decoder = new TextDecoder();
    const json = decoder.decode(decompressed);
    return JSON.parse(json);
  }
}

// Memory-efficient JSON streaming for large responses
export async function* streamJsonArray<T>(
  items: AsyncIterable<T> | T[],
  chunkSize: number = 100
): AsyncIterable<string> {
  yield '[';

  let first = true;
  let count = 0;

  for await (const item of items) {
    if (!first) yield ',';
    first = false;

    // Stream in chunks to avoid buffering entire array
    yield JSON.stringify(item);

    count++;
    if (count % chunkSize === 0) {
      // Yield control back to event loop
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  yield ']';
}

export const compressionManager = new CompressionStreamManager();
```

### Step 3: Create Memory Pool for Buffers

**File to create:** `src/utils/memory-pool.ts`

```typescript
interface PooledObject<T> {
  obj: T;
  lastUsed: number;
  useCount: number;
}

class MemoryPool<T extends { reset(): void }> {
  private pool: PooledObject<T>[] = [];
  private factory: () => T;
  private maxSize: number;
  private allocationCount: number = 0;

  constructor(
    factory: () => T,
    options: { initialSize?: number; maxSize?: number } = {}
  ) {
    this.factory = factory;
    this.maxSize = options.maxSize || 50;

    // Pre-allocate initial pool
    for (let i = 0; i < (options.initialSize || 10); i++) {
      this.pool.push({
        obj: factory(),
        lastUsed: Date.now(),
        useCount: 0,
      });
    }
  }

  acquire(): T {
    // Find available object
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const pooled = this.pool[i];
      if (pooled.useCount === 0 || pooled.lastUsed < Date.now() - 60000) {
        pooled.useCount++;
        pooled.lastUsed = Date.now();
        return pooled.obj;
      }
    }

    // Pool exhausted - create new if under limit
    if (this.pool.length < this.maxSize) {
      const obj = this.factory();
      this.pool.push({
        obj,
        lastUsed: Date.now(),
        useCount: 1,
      });
      this.allocationCount++;
      return obj;
    }

    // Force evict oldest
    const evicted = this.pool.shift();
    if (evicted) {
      this.pool.push({
        obj: evicted.obj,
        lastUsed: Date.now(),
        useCount: 1,
      });
      return evicted.obj;
    }

    // Fallback: create anyway (shouldn't happen)
    return this.factory();
  }

  release(obj: T): void {
    for (const pooled of this.pool) {
      if (pooled.obj === obj) {
        pooled.useCount = Math.max(0, pooled.useCount - 1);
        pooled.lastUsed = Date.now();
        obj.reset(); // Clean state for reuse
        return;
      }
    }
  }

  getStats(): { poolSize: number; allocated: number; utilization: number } {
    const inUse = this.pool.filter(p => p.useCount > 0).length;
    return {
      poolSize: this.pool.length,
      allocated: this.allocationCount,
      utilization: this.pool.length > 0 ? inUse / this.pool.length : 0,
    };
  }

  clear(): void {
    this.pool = [];
    this.allocationCount = 0;
  }
}

// Example pooled types
export class PooledJSONParser {
  private buffer: string = '';

  parse(chunk: string): any[] {
    const items: any[] = [];
    const parts = (this.buffer + chunk).split('\n');

    // Last part may be incomplete
    this.buffer = parts.pop() || '';

    for (const part of parts) {
      if (part.trim()) {
        try {
          items.push(JSON.parse(part));
        } catch {
          // Skip malformed JSON
        }
      }
    }

    return items;
  }

  reset(): void {
    this.buffer = '';
  }
}

// Create pools
export const parserPool = new MemoryPool(
  () => new PooledJSONParser(),
  { initialSize: 5, maxSize: 20 }
);

export const bufferPool = new MemoryPool(
  () => new Uint8Array(8192), // 8KB buffers
  { initialSize: 10, maxSize: 100 }
);
```

### Step 4: Memory Pressure Handler

**File to create:** `src/utils/memory-pressure-handler.ts`

```typescript
interface MemoryMetrics {
  rss: number; // Resident set size
  heapUsed: number;
  heapTotal: number;
  external: number;
  limit: number;
}

class MemoryPressureHandler {
  private thresholds: { warning: number; critical: number };
  private interval: NodeJS.Timeout | null = null;
  private onCritical: () => Promise<void>;

  constructor(
    warningMb: number = 100,
    criticalMb: number = 115,
    onCritical?: () => Promise<void>
  ) {
    this.thresholds = {
      warning: warningMb * 1024 * 1024,
      critical: criticalMb * 1024 * 1024,
    };
    this.onCritical = onCritical || this.defaultCriticalHandler;
  }

  start(intervalMs: number = 5000): void {
    this.interval = setInterval(() => this.check(), intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async check(): Promise<void> {
    const metrics = this.getMemoryMetrics();

    if (metrics.rss > this.thresholds.critical) {
      logger.error(`[MemoryPressure] CRITICAL: ${(metrics.rss / 1024 / 1024).toFixed(1)}MB`);
      await this.triggerCleanup();
      await this.onCritical();
    } else if (metrics.rss > this.thresholds.warning) {
      logger.warn(`[MemoryPressure] WARNING: ${(metrics.rss / 1024 / 1024).toFixed(1)}MB`);
      await this.triggerCleanup();
    }

    // Export metrics
    this.exportMetrics(metrics);
  }

  private getMemoryMetrics(): MemoryMetrics {
    if (typeof performance === 'undefined' || !('memory' in performance)) {
      return { rss: 0, heapUsed: 0, heapTotal: 0, external: 0, limit: 128 * 1024 * 1024 };
    }

    const mem = (performance as any).memory;
    return {
      rss: mem.rss,
      heapUsed: mem.usedJSHeapSize,
      heapTotal: mem.totalJSHeapSize,
      external: mem.external,
      limit: 128 * 1024 * 1024, // CF Worker limit
    };
  }

  private async triggerCleanup(): Promise<void> {
    // Aggressive cleanup on memory pressure
    logger.info('[MemoryPressure] Triggering cleanup...');

    // Clear LRU caches
    strategyCache.clear();
    marketDataCache.clear();
    agentContextCache.clear();

    // Clear memory pools
    parserPool.clear();
    bufferPool.clear();

    // Suggest GC (Workers may not respect this)
    if (typeof gc === 'function') {
      (gc as any)();
    }

    // Force Redis sync to offload memory
    await redis.bgsave();

    logger.info('[MemoryPressure] Cleanup complete');
  }

  private async defaultCriticalHandler(): Promise<void> {
    // Default: disable non-critical agents, reduce shard count
    logger.error('[MemoryPressure] Critical - reducing agent pool');

    // Emit event for orchestrator to handle
    await redis.publish('memory-pressure', JSON.stringify({
      level: 'critical',
      timestamp: Date.now(),
    }));

    // Could trigger graceful degradation:
    // - Disable background agents
    // - Reduce cache sizes
    // - Route to larger-memory regions
  }

  private exportMetrics(metrics: MemoryMetrics): void {
    const usedMb = metrics.rss / 1024 / 1024;
    const heapMb = metrics.heapUsed / 1024 / 1024;

    // Prometheus metrics
    memoryPressureRss.set(usedMb);
    memoryPressureHeap.set(heapMb);
    memoryPressureUtilization.set(metrics.rss / metrics.limit);

    // Cloudflare Analytics
    if (env === 'production') {
      // Send to custom analytics
    }
  }
}

// Prometheus metrics
export const memoryPressureRss = new Gauge({
  name: 'memory_rss_bytes',
  help: 'Worker RSS memory usage',
});
export const memoryPressureHeap = new Gauge({
  name: 'memory_heap_bytes',
  help: 'Worker heap memory usage',
});
export const memoryPressureUtilization = new Gauge({
  name: 'memory_utilization_ratio',
  help: 'Memory usage as ratio of limit',
});
```

### Step 5: Lazy Load Heavy Modules

**File to modify:** Strategy loading in `src/strategies/`

```typescript
// Instead of static imports, use dynamic imports
export async function loadStrategy(name: string): Promise<IStrategy> {
  // Check cache first
  const cached = strategyCache.get(name);
  if (cached) return cached;

  // Lazy load based on strategy name
  const strategyMap: Record<string, () => Promise<IStrategy>> = {
    'polymarket-arb': () => import('./polymarket/arbitrage-strategy.ts'),
    'kalshi-ml': () => import('./kalshi/ml-strategy.ts'),
    // ... others
  };

  const loader = strategyMap[name];
  if (!loader) {
    throw new Error(`Unknown strategy: ${name}`);
  }

  const strategy = await loader();
  strategyCache.set(name, strategy.default || strategy);
  return strategy.default || strategy;
}

// For agents too
export async function loadAgent(name: string): Promise<IAgent> {
  const cached = agentContextCache.get(name);
  if (cached) return cached;

  // Dynamic import - only loaded when needed
  const module = await import(`../intelligence/${name}.ts`);
  const agent = module.default || module;

  agentContextCache.set(name, agent);
  return agent;
}
```

### Step 6: Compressed Durable Object State

**File to modify:** `src/durable-objects/shard-manager.ts`

```typescript
import { compress, decompress } from '../utils/compression-stream';

class CompressedStateDO extends DurableObject {
  private state: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    const compressed = await this.storage.get(key);
    if (!compressed) return null;

    // Decompress on read
    const decompressed = await decompress(compressed);
    return JSON.parse(decompressed);
  }

  async set(key: string, value: any): Promise<void> {
    // Compress before storage
    const json = JSON.stringify(value);
    const compressed = await compress(json, 'br');
    await this.storage.put(key, compressed);
  }

  async getMultiple(keys: string[]): Promise<Map<string, any>> {
    const compressed = await this.storage.get(keys);
    const result = new Map<string, any>();

    for (const [key, data] of Object.entries(compressed)) {
      if (data) {
        const decompressed = await decompress(data as Buffer);
        result.set(key, JSON.parse(decompressed));
      }
    }

    return result;
  }
}
```

---

## Todo List

- [ ] Implement `LRUCache` utility with size-based eviction
- [ ] Create `CompressionStreamManager` for streaming responses
- [ ] Implement `MemoryPool` for buffer reuse
- [ ] Create `MemoryPressureHandler` with auto-cleanup
- [ ] Update strategy loading to use lazy imports
- [ ] Add compressed DO state storage
- [ ] Add memory metrics to Prometheus (`memory_rss_bytes`, etc.)
- [ ] Create Grafana memory dashboard panel
- [ ] Set up memory alerts (>100MB warning, >115MB critical)
- [ ] Test memory usage before/after optimization
- [ ] Benchmark compression overhead (<5% target)
- [ ] Document memory optimization patterns in `docs/performance-tuning.md`
- [ ] Update `docs/system-architecture.md` with memory architecture
- [ ] Load test memory under 52-strategy load (target <100MB)

---

## Success Criteria

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Peak memory usage | <100MB | `performance.memory.rss` |
| Compression overhead | <5% CPU | Benchmark comparison |
| LRU hit rate | >80% | Cache metrics |
| GC frequency | -50% major GCs | GC stats |
| Memory cleanup latency | <100ms | Pressure handler timing |

### Qualitative

- [ ] No OOM kills in 24h load test
- [ ] Memory grows linearly, not exponentially
- [ ] LRU eviction working (monitor eviction count)
- [ ] Compression streaming working for large responses
- [ ] Memory pressure handler triggers at threshold
- [ ] Strategy lazy loading verified (no eager imports)
- [ ] All memory metrics visible in Grafana

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Compression CPU overhead | Medium | Medium | Benchmark, make configurable, skip for small payloads |
| Cache stampede on eviction | Low | Medium | Cache warming, staggered TTL |
| Memory leak from pools | Medium | High | Pool size limits, stats tracking |
| Compression not supported | Low | Medium | Fallback to identity stream |
| Aggressive eviction causing misses | Medium | Low | Monitor hit rate, tune TTL |

---

## Security Considerations

1. **Compression side-channel**: Avoid compression for sensitive data (CRIME attack)
2. **Memory zeroing**: Clear sensitive data from pools on release
3. **Cache isolation**: Tenant isolation in shared caches (key prefixes)
4. **Memory dump protection**: Cloudflare handles this at platform level

---

## Files to Create/Modify

| File | Type | Description |
|------|------|-------------|
| `src/utils/lru-cache.ts` | New | Size-based LRU cache |
| `src/utils/compression-stream.ts` | New | Compression streaming utilities |
| `src/utils/memory-pool.ts` | New | Object/buffer pooling |
| `src/utils/memory-pressure-handler.ts` | New | Memory monitoring & cleanup |
| `src/strategies/registry.ts` | Modify | Lazy loading implementation |
| `src/durable-objects/*` | Modify | Compressed state storage |
| `src/middleware/prometheus-metrics.ts` | Modify | Add memory metrics |
| `docker/grafana/dashboards/memory.json` | New | Memory monitoring panel |
| `docs/performance-tuning.md` | New | Memory optimization docs |

---

## Rollback Plan

1. **Disable compression**: Use identity transform (no-op)
2. **Remove LRU**: Direct cache access (full cache)
3. **Disable pooling**: Allocate fresh objects (no reuse)
4. **Feature flag**: `ENABLE_MEMORY_OPTIMIZATION=false`

---

**Definition of Done:** Memory usage <100MB under normal load, <128MB peak under stress, all optimizations active with <5% overhead, memory dashboard complete, alerts configured, load test validates no OOM for 52 strategies.

# Redis Cluster Client Optimization Analysis

This report analyzes the Redis Cluster configuration and WebSocket adapter files (`src/redis/cluster-config.ts`, `src/redis/index.ts`, and `src/api/ws-adapter-redis.ts`) to identify performance bottlenecks and optimization opportunities for high connection volumes (5000+ concurrent clients/VUs).

---

## 1. Current Configuration & Setup Summary

We examined the existing implementation and found the following setup:

### Client Creation
- **Factory Pattern**: Clients are instantiated using `createRedisClusterClient()` and cached as singletons (`clusterClient`, `clusterPubClient`, `clusterSubClient`).
- **Cluster Topology**: A 6-node Redis Cluster is assumed (3 masters + 3 replicas) running on local ports `7000`-`7005` by default.
- **Client Modes**:
  - `getRedisClient()`: Returns the singleton `getRedisClusterClient()` if cluster mode is enabled; otherwise, returns a single-instance client.
  - `getPubClient()` & `getSubClient()`: In cluster mode, they call `createRedisClusterClient()` to return dedicated `clusterPubClient` and `clusterSubClient` instances.

### Current Connection Options (`src/redis/cluster-config.ts`)
```typescript
const DEFAULT_CLUSTER_CONFIG: RedisClusterConfig = {
  nodes: [...], // 7000 to 7005
  password: process.env.REDIS_CLUSTER_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  clusterRetryDelayOnFailover: 2000,
};

const options: ClusterOptions = {
  clusterRetryStrategy: (times: number) => {
    const delay = Math.min(100 * Math.pow(2, times), 2000);
    logger.info(`[RedisCluster] Retry attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
  retryDelayOnFailover: config.retryDelayOnFailover, // 100ms
  redisOptions: {
    password: config.password,
    connectTimeout: 10000, // 10s
    commandTimeout: 5000,  // 5s
    maxRetriesPerRequest: config.maxRetriesPerRequest, // 3
  },
  scaleReads: 'master', // Reads are routed ONLY to master nodes
};
```

### Pub/Sub & Adapter Configuration (`src/api/ws-adapter-redis.ts`)
- **Connection Handling**:
  ```typescript
  if (isClusterMode()) {
    this.pubClient = getRedisClusterClient();
    this.subClient = getRedisClusterClient();
  } else {
    this.pubClient = getPubClient();
    this.subClient = getSubClient();
  }
  ```
- **Broadcasting Mechanism**: 
  A single O(N) loop iterates over all clients (`this.clients.values()`) for every message received on subscribed channels:
  ```typescript
  private broadcastToChannel(channel: string, message: string): void {
    const parsed = JSON.parse(message);
    for (const client of this.clients.values()) {
      if (client.channels.has(channel) || this.config.channels.includes(channel)) {
        this.sendToClient(client, parsed);
      }
    }
  }
  ```

---

## 2. Performance Bottlenecks at High Load (5000+ VUs)

Under high concurrency (5000+ concurrent clients) and high message throughput, the current setup will encounter several critical bottlenecks:

### A. Subscriber/Publisher Connection Contention (Major Bug/Bottleneck)
- **Problem**: In `ws-adapter-redis.ts`, when cluster mode is enabled, both `pubClient` and `subClient` are assigned to the exact same instance (`getRedisClusterClient()`).
- **Impact**: In Redis, once a connection executes `SUBSCRIBE`, it enters subscriber mode and **cannot** execute regular commands like `PUBLISH`. Sharing the same `Cluster` client manager instance causes command failures, high latencies, and connection drops as ioredis struggles to manage shared connection states.
- **Why this occurs**: The code bypasses the dedicated `getPubClient()` and `getSubClient()` functions in cluster mode, which are designed to create separate cluster client instances.

### B. Master Node CPU Bottleneck (Read Scaling)
- **Problem**: `scaleReads` is set to `'master'`. All read operations (market data queries, user state, system configs) are routed only to the 3 master nodes.
- **Impact**: The 3 master nodes must handle 100% of both read and write commands. Under 5000+ VUs, this causes CPU saturation on masters, while the 3 replicas sit idle.

### C. O(N) Event Loop Blocking in WS Adapter
- **Problem**: For every incoming pub/sub message, `broadcastToChannel` runs an O(N) loop over all 5000+ clients.
- **Impact**: If market data generates 100 updates/sec, the event loop must execute `100 * 5000 = 500,000` iterations per second, plus `JSON.parse` operations. This will block the Node.js event loop, leading to extreme CPU usage, high latency spikes, and eventual client dropouts.
- **Incorrect Subscription Fallback**: The condition `this.config.channels.includes(channel)` is always true for default channels. This means every client is forced to receive *every* channel message (e.g., heavy market data updates) regardless of whether they subscribed to it.

### D. Thundering Herd and Failover Retries
- **Problem**: `retryDelayOnFailover` is 100ms, and `maxRetriesPerRequest` is 3.
- **Impact**: Redis Cluster failover (master election and slot promotion) typically takes 2-5 seconds. 
  - Having `maxRetriesPerRequest: 3` and a 100ms delay means the client will fail all queued commands within ~300ms, completely missing the failover window.
  - Retrying every 100ms under 5000+ concurrent connections creates a **thundering herd** command storm that overwhelms the newly promoted master node during slot initialization.

### E. Log Flooding CPU Bottleneck
- **Problem**: The `clusterRetryStrategy` logs a retry attempt at `info` level:
  ```typescript
  logger.info(`[RedisCluster] Retry attempt ${times}, delay: ${delay}ms`);
  ```
- **Impact**: During network disruption or failover, if 5000+ clients try to reconnect and log every attempt, the synchronous filesystem I/O or log processing will block the CPU completely, rendering the application server unresponsive.

### F. Out-of-Date Slot Cache Topology
- **Problem**: The configuration lacks periodic slot cache refresh parameters (`slotsRefreshInterval` and `slotsRefreshTimeout`).
- **Impact**: If nodes are added, removed, or fail over, the client depends on receiving `MOVED` or `ASK` errors to update its routing table. Without proactive refreshes, routing overhead increases, and connections to newly promoted nodes can be delayed.

---

## 3. Recommended Optimization Options

To support 5000+ concurrent connections, we recommend implementing the following optimizations:

### Read Scaling
- Change `scaleReads` to `'slave'` or `'all'`.
  - **`'slave'`**: Routes all read operations to replica nodes only, isolating master nodes for writes (recommended for high read/write ratio systems).
  - **`'all'`**: Distributes read operations across both masters and replicas using round-robin routing.
  - *Note*: Ensure the application accepts eventual consistency for reads, which is typical for market data and trading signals.

### Failover and Retry Backoff
- **Increase `retryDelayOnFailover`**: Raise this to `500`ms or `1000`ms to give the cluster time to complete failovers, and introduce a randomized jitter to prevent the thundering herd effect.
- **Command Queuing / Retries**: 
  - Increase `maxRetriesPerRequest` to `10` (or `null` for infinite queueing, with a `maxQueueLength: 10000` cap to prevent OOM) during failovers, ensuring commands survive the 2-5 second failover window.
  - Reduce `connectTimeout` to `3000`ms - `5000`ms and `commandTimeout` to `2000`ms to ensure fast detection of dead connections.

### Pub/Sub Optimization
- **Separation of Concerns**: Correct the bug in `ws-adapter-redis.ts` by using `getPubClient()` and `getSubClient()` for all modes.
- **Sharded Pub/Sub (Redis 7.0+)**: Switch from standard pub/sub (`subscribe`/`publish`) to sharded pub/sub (`ssubscribe`/`spublish`). In Redis Cluster, standard pub/sub broadcasts messages to every node in the cluster. Sharded Pub/Sub restricts message propagation to the slot owner of the channel name, drastically reducing inter-cluster network overhead.

### Slot Management
- **`slotsRefreshInterval`**: Set to `300000` (5 minutes) to periodically query cluster state and keep the topology map fresh.
- **`slotsRefreshTimeout`**: Set to `2000`ms to allow topology fetches to succeed even under heavy network load.

### WebSocket Adapter Performance
- **Active Subscription Indexing**: Replace the O(N) array loop in `broadcastToChannel` with a `channelSubscribers` map:
  ```typescript
  // Map<channelName, Set<WSClient>>
  private channelSubscribers: Map<string, Set<WSClient>> = new Map();
  ```
  This allows O(1) retrieval of only the clients subscribed to a given channel, reducing the loop from 5000 down to only the active subscribers.
- **Remove Global Channel Fallback**: Remove `|| this.config.channels.includes(channel)` so that clients only receive messages for channels they explicitly subscribed to.

---

## 4. Code Recommendations for `cluster-config.ts`

Here are the precise recommended changes for `src/redis/cluster-config.ts`.

### Proposed Changes (Diff)

```typescript
// Replace lines 21-34 in cluster-config.ts:
const DEFAULT_CLUSTER_CONFIG: RedisClusterConfig = {
  nodes: [
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7000 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7001 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7002 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7003 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7004 },
    { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7005 },
  ],
  password: process.env.REDIS_CLUSTER_PASSWORD,
  maxRetriesPerRequest: 10, // Increased from 3 to survive failover windows (~3-5s)
  retryDelayOnFailover: 500, // Increased from 100ms to reduce command storms (thundering herd)
  clusterRetryDelayOnFailover: 2000,
};

// Replace lines 45-61 in cluster-config.ts:
  const options: ClusterOptions = {
    clusterRetryStrategy: (times: number) => {
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, max 2000ms
      const delay = Math.min(100 * Math.pow(2, times), 2000);
      // Changed to logger.debug to prevent console log flooding under high concurrent load
      logger.debug(`[RedisCluster] Retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
    retryDelayOnFailover: config.retryDelayOnFailover,
    redisOptions: {
      password: config.password,
      connectTimeout: 5000, // Reduced from 10000ms for faster failover detection
      commandTimeout: 2000, // Reduced from 5000ms to fail fast and prevent thread pool starvation
      maxRetriesPerRequest: config.maxRetriesPerRequest,
      keepAlive: 10000, // Keep TCP connections alive to quickly spot dead connections
      noDelay: true, // Disable Nagle's algorithm for low-latency command execution
    },
    // Enable reading from replicas for better read scaling (horizontally distributes reads)
    scaleReads: 'slave', // Options: 'all', 'master', 'slave'
    // Periodic cluster topology refresh to keep slot layout updated
    slotsRefreshInterval: 300000, // Refresh every 5 minutes
    slotsRefreshTimeout: 2000, // Wait up to 2s for cluster topology refresh
  };
```

---

## 5. Architectural Recommendations for `ws-adapter-redis.ts`

Though `cluster-config.ts` handles the core connection parameters, the application cannot scale to 5000+ connections without correcting the Pub/Sub assignments and the O(N) broadcast logic in the WebSocket adapter.

### Recommended Fix for Pub/Sub Client Assignment (`src/api/ws-adapter-redis.ts`)
```typescript
// Replace lines 60-66:
    // ALWAYS use getPubClient() and getSubClient() to ensure separate cluster client instances
    this.pubClient = getPubClient();
    this.subClient = getSubClient();
```

### Recommended Optimization for Broadcast Loop (`src/api/ws-adapter-redis.ts`)
1. Maintain a subscriber map:
   ```typescript
   private channelSubscribers: Map<string, Set<WSClient>> = new Map();
   ```
2. Update subscriber indices on `subscribe` / `unsubscribe` / `disconnect`:
   ```typescript
   // On subscribe:
   if (!this.channelSubscribers.has(message.channel)) {
     this.channelSubscribers.set(message.channel, new Set());
   }
   this.channelSubscribers.get(message.channel)!.add(client);
   
   // On unsubscribe/disconnect:
   this.channelSubscribers.get(channel)?.delete(client);
   ```
3. Perform O(M) broadcasts:
   ```typescript
   private broadcastToChannel(channel: string, message: string): void {
     const parsed = JSON.parse(message);
     const subscribers = this.channelSubscribers.get(channel);
     if (subscribers) {
       for (const client of subscribers) {
         this.sendToClient(client, parsed);
       }
     }
   }
   ```

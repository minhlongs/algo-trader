# Handoff Report — Redis Cluster Optimization Analysis

This handoff report summarizes the findings, reasoning, and recommendations for optimizing the Redis Cluster client configuration and WebSocket adapter under high connection volumes (5000+ VUs).

---

## 1. Observation

We directly observed the following configuration settings and logic across the three target files:

### File: `src/redis/cluster-config.ts`
- **Line 31**: `maxRetriesPerRequest: 3,`
- **Line 32**: `retryDelayOnFailover: 100,`
- **Lines 46–51**:
  ```typescript
  clusterRetryStrategy: (times: number) => {
    // Exponential backoff: 100ms, 200ms, 400ms, 800ms, max 2000ms
    const delay = Math.min(100 * Math.pow(2, times), 2000);
    logger.info(`[RedisCluster] Retry attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
  ```
- **Lines 55–56**:
  ```typescript
  connectTimeout: 10000,
  commandTimeout: 5000,
  ```
- **Line 60**: `scaleReads: 'master',`
- **Note**: The topology options lack `slotsRefreshInterval` and `slotsRefreshTimeout` settings.

### File: `src/redis/index.ts`
- **Lines 78–102**: `getPubClient()` and `getSubClient()` are defined and return separate cluster client instances (`clusterPubClient` and `clusterSubClient`):
  ```typescript
  export function getPubClient(): Redis | Cluster {
    if (process.env.REDIS_CLUSTER_ENABLED === 'true') {
      if (!clusterPubClient) {
        clusterPubClient = createRedisClusterClient();
      }
      return clusterPubClient;
    } ...
  ```

### File: `src/api/ws-adapter-redis.ts`
- **Lines 60–66**: In the `RedisWSAdapter` constructor, the same cluster client instance is used for both publishing and subscribing if cluster mode is enabled:
  ```typescript
  if (isClusterMode()) {
    this.pubClient = getRedisClusterClient();
    this.subClient = getRedisClusterClient();
  } else {
    this.pubClient = getPubClient();
    this.subClient = getSubClient();
  }
  ```
- **Lines 229–237**: Broadcaster logic runs an O(N) loop iterating over all clients:
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

## 2. Logic Chain

1. **Shared Pub/Sub Instance Bottleneck**:
   - In `ws-adapter-redis.ts:60-66`, both `this.pubClient` and `this.subClient` point to the single client instance returned by `getRedisClusterClient()`.
   - Redis requires separate connection states for publishing and subscribing. Once `subscribe()` is called on `subClient`, that connection enters subscriber mode and rejects/blocks non-pub/sub commands. Sharing the instance forces `ioredis` to manage conflicting states internally, leading to command queue blockage, high connection latency, or dropouts under high load.
   - *Therefore*, the adapter must use separate pub and sub cluster client instances, as handled by `getPubClient()` and `getSubClient()`.

2. **Master-Only Read Bottleneck**:
   - In `cluster-config.ts:60`, `scaleReads` is `'master'`. All read operations go to the 3 master nodes, ignoring the 3 replicas.
   - Under 5000+ VUs, this causes high CPU load on masters, while replicas remain idle.
   - *Therefore*, changing `scaleReads` to `'slave'` or `'all'` is necessary to scale read throughput horizontally.

3. **Short Failover Timeout and Command Failures**:
   - In `cluster-config.ts:31-32`, `maxRetriesPerRequest` is `3` and `retryDelayOnFailover` is `100`ms.
   - A standard Redis Cluster failover takes 2–5 seconds. The client's retry window is only `3 * 100ms = 300ms`, which is insufficient to survive a node failover, causing application transactions to fail.
   - *Therefore*, raising the retry delay and count allows commands to be buffered and survive failover.

4. **Event Loop Blocking in Broadcast**:
   - In `ws-adapter-redis.ts:229-237`, broadcasting to a channel loops through all 5000+ connections in O(N) complexity.
   - Under heavy message volume, this locks the single-threaded Node.js event loop. Additionally, checking `this.config.channels.includes(channel)` causes all clients to receive all messages for default channels.
   - *Therefore*, maintaining a lookup map of `channel -> Set<WSClient>` reduces the broadcast complexity to O(M) where M is only the subscribed clients.

---

## 3. Caveats

- **Eventual Consistency**: Setting `scaleReads` to `'slave'` or `'all'` means read commands may return slightly stale data due to asynchronous replication delay between master and replicas. If strict write-after-read consistency is required for specific flows (e.g., checking account balance), they should bypass this client and use a master-only connection.
- **Memory Overhead of Command Queuing**: If `maxRetriesPerRequest` is set to a large number or `null`, failed commands queue in memory during network partitions. Under 5000+ VUs, this can trigger an Out-of-Memory (OOM) error if the outage is prolonged. Thus, we recommend capping the max retries to `10` or utilizing `maxQueueLength: 10000`.
- **Infrastructure Context**: We assumed a standard AWS ElastiCache or self-hosted Redis Cluster topology behind a local or virtual private network. NAT/IP translation rules (e.g., `natMap`) were not modeled since network environment details were not provided.

---

## 4. Conclusion

The current Redis Cluster configuration is not optimized for high connection volumes. It suffers from a connection contention issue (shared singleton for pub/sub), lacks read scalability (master-only reads), has retry thresholds too narrow to survive standard failovers, and relies on an O(N) broadcast loop that will block the event loop under load.

### Summary of Actionable Recommendations:
1. **Fix connection contention**: Change `ws-adapter-redis.ts` to assign `this.pubClient = getPubClient()` and `this.subClient = getSubClient()` globally.
2. **Enable replica reads**: Set `scaleReads` to `'slave'` or `'all'` in `cluster-config.ts`.
3. **Enhance failover resilience**: Increase `maxRetriesPerRequest` to `10` and `retryDelayOnFailover` to `500`ms, and add periodic topology refreshes (`slotsRefreshInterval: 300000`).
4. **Refactor the WS broadcast loop**: Implement a `channelSubscribers` index map inside the WebSocket adapter to replace the O(N) traversal.
5. **Sharded Pub/Sub**: Consider upgrading to Redis 7.0+ sharded pub/sub to reduce inter-cluster broadcast traffic.

---

## 5. Verification Method

### How to Verify the Redis Cluster Options:
1. Check that unit/integration tests run successfully with the proposed `cluster-config.ts` configuration changes:
   ```bash
   npm test
   ```
2. Verify connection settings in the logger output:
   - Ensure cluster nodes initialize correctly.
   - Check that `logger.debug` is used instead of `logger.info` for retry attempts, reducing log clutter.

### Invalidation Conditions:
- The optimization recommendations are invalidated if the system requires strict read-after-write consistency across all trading functions, in which case `scaleReads: 'slave'` cannot be globally applied.

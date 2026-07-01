# Implementation Plan — Redis & WebSocket Optimization

## Objectives
1. Modify `src/redis/cluster-config.ts` to tune the cluster parameters.
2. Modify `src/api/ws-adapter-redis.ts` to fix connection contention and refactor subscriber broadcast to O(M) mapping using a `channelSubscribers` Map.
3. Verify compilation and test suite correctness (specifically `pnpm test tests/integration/redis-client-pubsub-discipline-sync.test.ts`).

## Detailed Steps

### Step 1: Redis Cluster Optimization
Modify `/Users/macbook/algo-trader/src/redis/cluster-config.ts`:
- Update `DEFAULT_CLUSTER_CONFIG`:
  - `maxRetriesPerRequest`: 3 -> `10`
  - `retryDelayOnFailover`: 100 -> `500`
- Update `options` in `createRedisClusterClient`:
  - Change `scaleReads` to `'slave'`
  - Add `slotsRefreshInterval: 300000`
  - Add `slotsRefreshTimeout: 2000`
  - Change `logger.info` to `logger.debug` in `clusterRetryStrategy`
- Update `options.redisOptions` in `createRedisClusterClient`:
  - Change `connectTimeout` to `5000`
  - Change `commandTimeout` to `2000`
  - Add `keepAlive: 10000`
  - Add `noDelay: true`

### Step 2: WebSocket Connection Optimization
Modify `/Users/macbook/algo-trader/src/api/ws-adapter-redis.ts`:
- In constructor, assign:
  ```typescript
  this.pubClient = getPubClient();
  this.subClient = getSubClient();
  ```
  globally, bypassing the `isClusterMode()` check conditional assignment.

### Step 3: WebSocket Broadcasting Optimization (O(M) Lookup)
Modify `/Users/macbook/algo-trader/src/api/ws-adapter-redis.ts`:
- Define private member variable `channelSubscribers: Map<string, Set<WSClient>> = new Map();` in `RedisWSAdapter`.
- Update `'subscribe'` handler in `handleClientMessage`:
  - Add client to the set corresponding to `message.channel` inside `channelSubscribers`.
- Update `'unsubscribe'` handler in `handleClientMessage`:
  - Remove client from the set corresponding to `message.channel` inside `channelSubscribers`.
- Update connection `'close'` handler in `setupWebSocket`:
  - Loop over `client.channels` and remove the client from all channels in `channelSubscribers`.
- Update `shutdown` method:
  - Clear `channelSubscribers` map.
- Refactor `broadcastToChannel`:
  - Look up subscribers Set from `channelSubscribers` by `channel`.
  - Loop only over the target channel's subscribers.

### Step 4: Verification
- Run typescript compilation (`npm run build`).
- Run the integration test suite: `pnpm test tests/integration/redis-client-pubsub-discipline-sync.test.ts`.

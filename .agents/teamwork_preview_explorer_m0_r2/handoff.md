# Handoff Report: Redis-Based Distributed Rate Limiter (R2)

This report details the investigation findings, architectural requirements, proposed design, and verification plan for implementing a Redis-based sliding window distributed rate limiter.

---

## 1. Observation
1. **Current Rate Limiting Setup**:
   - `src/api/server.ts` lines 101-106 implements an Express global rate limiter using `express-rate-limit` with an in-memory store:
     ```typescript
     const limiter = rateLimit({
       windowMs: this.config.rateLimitWindowMs,
       max: this.config.rateLimitMax,
       message: { error: 'Too many requests, please try again later' },
     });
     this.app.use('/api', limiter);
     ```
   - `src/resilience/rate-limiter.ts` manages client-side outbound rate limiting Presets (Binance, Bybit, OKX, Polymarket) using a local Token Bucket algorithm. This is for exchange client operations and does not affect incoming requests.

2. **Pricing Tiers and Access Config**:
   - `src/gate/config/tier-config.ts` lines 22-47 defines `TIER_CONFIG` with requests per minute for each tier:
     ```typescript
     export const TIER_CONFIG: Record<LicenseTier, TierConfig> = {
       [LicenseTier.FREE]: {
         requestsPerMin: 10,
         ...
       },
       [LicenseTier.PRO]: {
         requestsPerMin: 100,
         ...
       },
       [LicenseTier.ENTERPRISE]: {
         requestsPerMin: 1000,
         ...
       },
     };
     ```

3. **Tenant & Identity Resolution**:
   - Routes under `/api/v1/signals` (such as `src/api/routes/signal-feed-routes.ts` lines 30-43) resolve tenant licenses by parsing the `Authorization` header (`Bearer <KEY>`) or looking up keys using `RaasGate.getInstance().validateApiKey(apiKey)`.
   - `RaasGate.validateApiKey(apiKey)` calls `LicenseService.getInstance().getLicenseByKey(apiKey)` (from `src/gate/raas-gate.ts` line 56).
   - If resolved, the `License` object has properties `id` (license ID), `tenantId` (tenant identity), and `tier` (`FREE`, `PRO`, `ENTERPRISE`).

4. **Redis Connections & Cluster Setup**:
   - `src/redis/index.ts` instantiates connection pools. It returns a Redis Cluster client when `process.env.REDIS_CLUSTER_ENABLED === 'true'` (lines 63-76):
     ```typescript
     export function getRedisClient(): Redis | Cluster {
       if (process.env.REDIS_CLUSTER_ENABLED === 'true') {
         return getRedisClusterClient();
       }
       ...
     ```
   - `src/redis/cluster-config.ts` configures a 6-node cluster on localhost ports `7000-7005` (lines 21-34):
     ```typescript
     const DEFAULT_CLUSTER_CONFIG: RedisClusterConfig = {
       nodes: [
         { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7000 },
         { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7001 },
         { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7002 },
         { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7003 },
         { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7004 },
         { host: process.env.REDIS_CLUSTER_HOST || '127.0.0.1', port: 7005 },
       ],
       ...
     ```

---

## 2. Logic Chain
1. Since the current rate limiter (`express-rate-limit`) in `src/api/server.ts` uses an in-memory store, it is node-local and will not synchronize counts across multiple gateway instances.
2. To scale to a distributed environment, the rate limits must be centralized. We must use the existing Redis Cluster connection (`getRedisClient()`) which already supports cluster mode when `REDIS_CLUSTER_ENABLED=true`.
3. To resolve pricing tier limits per request, the rate limiter must inspect either `x-api-key` or `Authorization: Bearer <key>`, retrieve the license metadata from `LicenseService`, and match the tier (`FREE`/`PRO`/`ENTERPRISE`) to `TIER_CONFIG` rates.
4. If no valid license key is supplied, we must treat the request as anonymous and apply the `FREE` tier limit (10 req/min) keyed by client IP (`req.ip`) to protect the server from spam.
5. In a Redis Cluster, keys must hash to the same slot for multi-key queries. Though we evaluate one tenant key, we should encapsulate it in a hash tag `ratelimit:{tenantId}` to ensure slot consistency and proper cluster routing.
6. To avoid race conditions and network round-trips when checking and updating the sliding window, we must execute an atomic Lua script in Redis. This script uses a sorted set (`ZSET`) where timestamps represent score and value, clearing old entries and verifying the cardinality before adding a new request.
7. System paths like `/api/health`, `/api/webhooks/*`, and `/api/auth/*` must be excluded from limit checks to maintain cluster health checks and critical callback routes.
8. If Redis fails, a fail-open policy must be enforced (catch the error, log it, and call `next()`) so the application remains available.

---

## 3. Caveats
- **Better Auth Exclusions**: Better Auth is mounted at `/api/auth` and runs on Node handlers. It has built-in auth rate limiting. We have bypassed `/api/auth` under the assumption that it regulates its own rate limiting.
- **Fail-Open Policy Risk**: While failing open protects API availability if Redis is down, it exposes the server to potential overload/attacks during Redis outages.
- **IP Address Trust**: Relying on `req.ip` for anonymous rate limiting assumes the proxy configuration correctly sets headers like `X-Forwarded-For`. If not, all anonymous traffic might share a single IP limit.

---

## 4. Conclusion
We must implement a custom sliding-window distributed rate limiter middleware inside `src/middleware/distributed-rate-limiter.ts` using a cluster-safe Redis Lua script. We must then register it on `/api` routes in `src/api/server.ts` to replace `express-rate-limit`. 

Proposed implementation files and patches have been created:
- New Middleware: `.agents/teamwork_preview_explorer_m0_r2/proposed_distributed_rate_limiter.ts`
- Server Patch: `.agents/teamwork_preview_explorer_m0_r2/server.patch`

---

## 5. Verification Method

### A. Independent Verification Plan
1. **Unit Testing**:
   - Write unit tests in `src/api/__tests__/rate-limit.test.ts` to verify middleware behavior.
   - Run the test suite:
     ```bash
     vitest run src/api/__tests__/rate-limit.test.ts
     ```
2. **Integration / Load Verification**:
   - Run a cluster of Redis nodes locally on ports 7000-7005.
   - Run the API server with `REDIS_CLUSTER_ENABLED=true`.
   - Send requests using `k6` configured for various rates (e.g. 15 requests for a FREE tier key within 10 seconds) and assert that the 11th request returns `HTTP 429` with rate-limiting headers.

### B. Invalidation Conditions
- Changing the structure of `License` or `TIER_CONFIG` will invalidate this design.
- If Redis Cluster routing fails because of slot mapping issues, verify the hash tag syntax `{tenantId}` matches the ioredis key slot logic.

---

## 6. Remaining Work
The next agent (Implementer) must:
1. Place the code from `proposed_distributed_rate_limiter.ts` into a new file: `src/middleware/distributed-rate-limiter.ts`.
2. Apply `server.patch` (or manually edit `src/api/server.ts` as specified) to switch the rate limiter.
3. Write `src/api/__tests__/rate-limit.test.ts` to cover unit verification cases.
4. Execute `vitest run` on the API and rate limiter tests to confirm it builds and functions properly.

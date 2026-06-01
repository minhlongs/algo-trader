# Analysis: Redis-Based Distributed Rate Limiter (R2)

This report details the architecture, design, and changes required to implement a sliding window distributed rate limiter using Redis Cluster for all incoming API endpoints under `/api/`.

---

## 1. Executive Summary
The goal is to replace the single-instance, memory-store-based `express-rate-limit` global middleware in the Express API gateway with a cluster-aware, sliding window distributed rate limiter. Rate limits must enforce limits mapped to tenant pricing tiers resolved from active licenses:
- **FREE**: 10 requests per minute
- **PRO**: 100 requests per minute
- **ENTERPRISE**: 1000 requests per minute
- **Anonymous/Fallback**: 10 requests per minute (mapped to FREE limits, keyed by client IP)

Violations must return HTTP Status `429 Too Many Requests`.

---

## 2. Current Architecture Investigation

### A. Global Rate Limiting in `src/api/server.ts`
Currently, the Express application sets up basic in-memory rate limiting using `express-rate-limit` for all `/api` routes (lines 101-106):
```typescript
const limiter = rateLimit({
  windowMs: this.config.rateLimitWindowMs,
  max: this.config.rateLimitMax,
  message: { error: 'Too many requests, please try again later' },
});
this.app.use('/api', limiter);
```
*Issue*: This is in-memory and non-distributed. When running multiple gateway instances behind a load balancer, each instance enforces its own count, leading to inconsistent rate limits.

### B. Exchange-Level Rate Limiting in `src/resilience/rate-limiter.ts`
The application implements client-side token bucket limiting for making outbound API requests to external cryptocurrency exchanges (Binance, Bybit, OKX, Polymarket) via `TokenBucket` and `RateLimiterRegistry`. This is out of scope for *incoming* API limit enforcement but demonstrates the use of rate limiters elsewhere.

### C. Tenant & Pricing Tier Resolution
Tenant identity and license verification occur by extracting an API/License key from requests.
- **Headers**:
  - `x-api-key` header (e.g. `req.headers['x-api-key']`)
  - `Authorization` header (`Bearer <KEY>`)
- **Resolution Path**:
  - Call `LicenseService.getInstance().getLicenseByKey(apiKey)` to check the `data/licenses.json` store.
  - If a valid, active license is retrieved:
    - **Tenant Identity**: `license.tenantId` or `license.id`.
    - **Pricing Tier**: `license.tier` (`FREE`, `PRO`, or `ENTERPRISE`).
  - If no key is provided, or the key is invalid:
    - **Tenant/Client Identity**: Fallback to client IP address (`req.ip`).
    - **Pricing Tier**: Defaults to `FREE` (10 req/min).

---

## 3. Redis Connection & Cluster Config

### A. Redis Connection Instantiation (`src/redis/index.ts`)
Redis connection configuration is handled centrally.
- It supports single-instance or cluster mode based on `process.env.REDIS_CLUSTER_ENABLED === 'true'`.
- `getRedisClient()` returns either a single `Redis` instance or a `Cluster` instance from `ioredis`.

### B. Redis Cluster Config (`src/redis/cluster-config.ts`)
- Runs a 6-node Redis cluster (3 masters + 3 replicas).
- Ports: `7000` to `7005` (inclusive), host: `127.0.0.1` (configurable via `REDIS_CLUSTER_HOST`).
- Supports automatic slot routing, replica read-scaling (`scaleReads: 'slave'`), and retry strategies with failover delay.
- The `Cluster` instance from `ioredis` supports defined commands (`redis.defineCommand()`) similar to single-instance clients.

---

## 4. Sliding Window Rate Limiter Design

To achieve an atomic, sliding-window rate limit check across multiple instances without race conditions, we will execute a Lua script in Redis.

### A. Cluster-Safe Lua Script
In Redis Cluster, all keys used in a command must map to the same hash slot. To guarantee slot consistency, we use **Redis Hash Tags** `{}` on the tenant ID (e.g. `ratelimit:{tenantId}`).

**Lua Script Logic**:
```lua
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - window

-- 1. Remove expired timestamps outside the sliding window
redis.call('zremrangebyscore', key, 0, clearBefore)

-- 2. Count requests remaining in the current sliding window
local currentRequests = redis.call('zcard', key)

if currentRequests < limit then
    -- 3. Log current request timestamp and set expiration to prevent leak
    redis.call('zadd', key, now, now)
    redis.call('expire', key, math.ceil(window / 1000) + 1)
    return {1, currentRequests + 1} -- [allowed: true, currentCount]
else
    return {0, currentRequests} -- [allowed: false, currentCount]
end
```

### B. Proposed Middleware Configuration
The middleware `distributedRateLimiter` will:
1. Exclude public and system routes: `/api/health`, `/api/webhooks/*`, `/api/auth/*`.
2. Extract the API key and resolve the tenant ID and tier from `LicenseService`.
3. Select the appropriate limit:
   - `FREE`: 10 requests / 60 seconds
   - `PRO`: 100 requests / 60 seconds
   - `ENTERPRISE`: 1000 requests / 60 seconds
4. Execute the Lua script on the Redis Cluster connection.
5. If allowed:
   - Return standard headers:
     - `X-RateLimit-Limit`: `limit`
     - `X-RateLimit-Remaining`: `limit - currentRequests`
   - Proceed with `next()`.
6. If blocked:
   - Set `X-RateLimit-Remaining`: `0`
   - Respond with HTTP `429 Too Many Requests` and JSON payload:
     ```json
     {
       "error": "Too Many Requests",
       "message": "Rate limit exceeded. Upgrade your plan for higher limits.",
       "tier": "FREE",
       "limit": 10
     }
     ```
7. **Fail-Open Policy**: If Redis goes down, catch the error, log it, and fail open (`next()`) to ensure gateway availability.

---

## 5. Changes Needed & Files to Touch

### A. New File: `src/middleware/distributed-rate-limiter.ts`
Implement the Express middleware that integrates with `LicenseService` and `ioredis` (using the defined Lua script command).
*(See `proposed_distributed_rate_limiter.ts` in `.agents/teamwork_preview_explorer_m0_r2` for implementation code)*

### B. Modified File: `src/api/server.ts`
- Remove the `express-rate-limit` import and usage.
- Register `distributedRateLimiter` on all `/api` routes:
```typescript
import { distributedRateLimiter } from '../middleware/distributed-rate-limiter';
// ...
this.app.use('/api', distributedRateLimiter);
```
*(See `server.patch` in `.agents/teamwork_preview_explorer_m0_r2` for the exact code diff)*

---

## 6. Verification and Testing Plan

### A. Unit and Integration Testing (`src/api/__tests__/rate-limit.test.ts`)
Create a new integration test using `vitest` and `supertest`:
1. **Mock Redis Cluster**: Mock the custom `rateLimit` Lua script command behavior for different test cases.
2. **Mock Licenses**: Load mock licenses for FREE, PRO, and ENTERPRISE tiers.
3. **Verify Headers**: Check for `X-RateLimit-Limit` and `X-RateLimit-Remaining` on HTTP responses.
4. **Verify HTTP 429**: Perform sequential requests exceeding the limits for each tier and assert HTTP 429 response status and JSON payload.
5. **Verify Exclusions**: Assert that endpoints like `/api/health` are never rate-limited.
6. **Verify Fallback/Anonymous**: Check that requests without keys are limited to 10 req/min under the client's IP.

### B. Integration Testing Commands
```bash
# Run API unit tests
vitest run src/api/__tests__/api.test.ts

# Run new rate limiter tests
vitest run src/api/__tests__/rate-limit.test.ts
```

### C. Load & Rate Limit Saturation Testing
Using `k6` (configured in `tests/load/raas-gateway-load-test.js` or a new script):
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 5,
  duration: '10s',
};

export default function () {
  const params = { headers: { 'x-api-key': 'RAAS-FREE-TESTKEY' } };
  const res = http.get('http://localhost:3000/api/status', params);
  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });
}
```
Validate that exactly 10 requests succeed in the 60-second window, and all subsequent requests receive 429.

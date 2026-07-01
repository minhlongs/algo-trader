## 2026-05-30T12:05:22Z
You are the Worker for Phase 35, Milestone 2: Redis-Based Distributed Rate Limiter (R2).
Your working directory is `/Users/macbook/algo-trader/.agents/teamwork_preview_worker_m2`.

Objective:
Implement a custom sliding-window distributed rate limiter middleware using a Redis Cluster-safe Lua script, replace the in-memory global rate limiter in `src/api/server.ts`, and support varying rate limits by tenant pricing tier.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Steps to perform:
1. Create a new middleware file: `src/middleware/distributed-rate-limiter.ts` using the sliding-window rate limiter logic proposed by the explorer.
   - You MUST NOT use `any` or `@ts-ignore` in this file. For example, rather than using `(redis as any)`, define an interface extending ioredis `Redis` / `Cluster` or cast using a custom interface (e.g. `(redis as RedisClientType & { rateLimit: Function })` or similar, making sure it passes TypeScript compilation strictly).
   - Ensure the keys have hash tags `ratelimit:{tenantId}` to ensure slot compatibility on Redis Cluster.
   - Pricing Tiers (requests per minute):
     - FREE / Anonymous: 10
     - PRO: 100
     - ENTERPRISE: 1000
   - Rate limit headers (e.g. `X-RateLimit-Limit`, `X-RateLimit-Remaining`).
   - Exclude paths starting with `/api/health`, `/api/webhooks`, `/api/auth`.
   - Implement fail-open behavior: if Redis has errors, log them and call `next()`.
2. Apply changes to `src/api/server.ts` to register the `distributedRateLimiter` middleware on `/api` and remove the local `express-rate-limit` configuration.
3. Write unit and integration tests inside `src/api/__tests__/rate-limit.test.ts`. Use a mock/stub Redis client if needed, or check if existing test configurations mock Redis. The tests should cover:
   - Request allowed under limits (both with license keys and anonymous).
   - Request blocked (returning HTTP 429) when limits are exceeded.
   - Correct rate limit headers.
   - Bypassing of excluded routes.
   - Fail-open when Redis client throws connection errors.
4. Run the test suite and verify all rate limiting tests and existing API/resilience tests pass 100%.
5. Verify TypeScript compiles with no errors (`npx tsc --noEmit`).

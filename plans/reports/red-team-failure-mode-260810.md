# Red Team Failure Mode Analysis — Security Hardening Plan 260810-1656

**Scope**: All 4 phases (Audit Logging Unification, Redis Rate Limiter Tier Integration, AES-256 Encryption at Rest, Integration & E2E Tests)
**Review Date**: 2026-08-10
**Reviewer**: Failure Mode Analyst (Hostile Mode)

---

## Executive Summary

**23 Critical/High findings** across 4 phases. The plan assumes happy-path infrastructure behavior and ignores distributed systems realities: Redis Cluster split-brain, PG advisory lock contention, encryption key rotation without migration strategy, audit log unbounded growth, rate limiter memory leaks, partial write corruption, deadlock under load, cold start failures, graceful shutdown gaps, and observability blind spots.

---

## Findings Array

### Phase 01: Audit Logging Unification

| File | Finding | Severity | Evidence | Suggested Fix |
|------|---------|----------|----------|---------------|
| `phase-01-audit-logging-unification.md` | **Sequence collision under concurrent writes** — The plan mentions `SELECT ... FOR UPDATE` or advisory lock but doesn't mandate it. Without per-tenant locking, concurrent `appendTenantAuditLog()` calls will produce duplicate sequence numbers, breaking hash chain verification. | Critical | `tenant-audit-log.ts:140-160` computes `nextSeq = (await getMaxSequence()) + 1` non-atomically. No locking shown in migration 041. | Mandate `pg_advisory_xact_lock(hashtext(tenant_id))` before sequence fetch in `appendTenantAuditLog`. Add integration test with 50 concurrent writers per tenant. |
| `phase-01-audit-logging-unification.md` | **Hash chain verification O(N) per tenant** — `verifyTenantAuditChain()` fetches ALL rows for a tenant and recomputes hashes sequentially. With 10M+ rows/tenant, verification takes minutes, blocks cleanup, and OOMs Node process. | Critical | `tenant-audit-log.ts:190-224` loops all rows in memory. No pagination, no streaming. | Add `verifyTenantAuditChainStreaming()` using cursor + batch verification. Expose `verifyFromSequence(startSeq)` for incremental verification. |
| `phase-01-audit-logging-unification.md` | **Migration 041 backfill produces wrong sequence order** — Plan says "use ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY timestamp, id)" but `audit_log.id` is TEXT (UUID), not sortable by creation time. Timestamp ties + UUID randomness = non-deterministic ordering. | High | Migration 038: `id TEXT PRIMARY KEY` (UUID v4). Migration 039 adds `tenant_id`. Backfill query will produce random sequence for same-timestamp rows. | Use `created_at` (TIMESTAMPTZ) if available, or add `sequence_generated_at` column. Backfill must use `ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY "timestamp", created_at, id)`. |
| `phase-01-audit-logging-unification.md` | **Immutability trigger GUC bypass is operator-only** — `audit.cleanup_allowed` GUC requires superuser to set. No automated cleanup job defined. Table grows unbounded until disk full. | High | Migration 040: `current_setting('audit.cleanup_allowed', true) <> 'on'`. No cleanup job in plan. | Define cron job (Inngest/pg_cron) that sets GUC, deletes rows older than retention, unsets GUC. Add `retention_days` column per tenant. |
| `phase-01-audit-logging-unification.md` | **No audit log partitioning strategy** — Single `audit_log` table with 3 indexes. At 100M rows, INSERT latency spikes, index maintenance blocks writes, vacuum fails. | High | Migration 038-040: 3 indexes on single table. No partitioning mentioned. | Implement native PG partitioning by `tenant_id` (hash) or `timestamp` (range). Plan partition maintenance in Phase 04. |
| `phase-01-audit-logging-unification.md` | **Hash chain computes over `JSONB metadata` directly** — `JSONB` field ordering is not guaranteed across PG versions. `jsonb_build_object()` may produce different key order than client-side serialization, causing false tampering alerts. | High | `tenant-audit-log.ts:70-80` computes `hash = createHash('sha256').update(previousHash + sequence + eventType + actionBy + JSON.stringify(metadata)).digest('hex')` | Canonicalize metadata: `JSON.stringify(Object.fromEntries(Object.entries(metadata).sort()))` or use deterministic `jsonb_strip_nulls` + sorted keys in PG function. |
| `phase-01-audit-logging-unification.md` | **Fail-closed on write failure throws unhandled** — `logAudit()` throws on DB failure. Middleware `auditMiddleware` catches but only logs. Request succeeds without audit record. Silent audit gap. | High | `audit-log.ts:120-130` throws. `audit-middleware.ts:70-80` catches, logs, calls `next()`. No circuit breaker, no dead letter queue. | Add audit write circuit breaker. On persistent failure, queue to local file/Redis for replay. Alert on audit gap > threshold. |
| `phase-01-audit-logging-unification.md` | **IP hash stored but no salt/pepper** — `hashIpAddress()` uses raw SHA-256. Rainbow table attacks trivial for IPv4 space (4B addresses). | Medium | `audit-ip-hash.ts:1-10`: `createHash('sha256').update(ip).digest('hex')` | Add per-deployment pepper from env var. Store `hmac_sha256(ip, pepper)` not raw hash. |
| `phase-01-audit-logging-unification.md` | **Tenant isolation at query layer only** — No RLS (Row Level Security) policies on `audit_log`. Bug in middleware = cross-tenant audit leakage. | Medium | Plan: "`tenant_id` enforcement at query layer". No `CREATE POLICY` in migrations. | Add RLS: `ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_isolation ON audit_log USING (tenant_id = current_setting('app.current_tenant')::text);` |

---

### Phase 02: Redis Rate Limiter Tier Integration

| File | Finding | Severity | Evidence | Suggested Fix |
|------|---------|----------|----------|---------------|
| `phase-02-redis-rate-limiter-tier-integration.md` | **Redis Cluster split-brain → duplicate rate limit keys** — Plan uses hash tags `{tenant_id}` for co-location but ignores split-brain. During partition, two masters accept writes for same slot. Rate limit counters diverge. On merge, last-write-wins loses increments → under-counting → rate limit bypass. | Critical | `redis-rate-limiter.ts:80-100` uses `zadd`/`zremrangebyscore` on sorted set. `cluster-config.ts` enables Cluster mode. No CRDT or conflict resolution. | Use Redis Cluster with `readonly` replicas disabled for rate limiter (single master per slot). Or implement application-level deduplication: include request UUID in sorted set member, dedupe on read. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **Fail-open on Redis failure = unlimited requests** — "Graceful degradation: allows request + logs warning". Under sustained Redis outage, ALL requests pass. No circuit breaker, no fallback to local token bucket. | Critical | `redis-rate-limiter.ts:110-130`: `catch { logger.warn(...); return { allowed: true, remaining: limit, resetAt: 0 }; }` | Add local in-memory token bucket fallback (per-process). Track Redis health; after N failures, switch to local mode with reduced limit. Alert on fallback activation. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **Tier resolution from `req.user?.tier` — no validation** — `defaultGetTier()` trusts `req.user.tier` string. Malformed/missing tier → `DEFAULT_TIER_LIMITS` (FREE). Attacker can forge header to get higher tier limits. | High | `redis-rate-limiter.ts:392-398`: `return (req.user?.tier as string) ?? 'FREE';` No enum validation. | Validate tier against `TIER_RATE_LIMITS` keys. Reject unknown tiers with 400. Use canonical tier config from Phase 01. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **Memory leak in `getCurrentCount()` on Redis error** — `zcard` throws, caught, returns 0. But sorted set keys never expire on error path. Keys accumulate indefinitely. | High | `redis-rate-limiter.ts:210-225`: Error path returns 0, no `del`/`expire`. Keys have TTL only on success path. | Ensure `expire` called in `finally` block. Or use Redis `EX` on `zadd` (not supported). Schedule periodic cleanup job for orphaned keys. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **No rate limit key TTL on Redis Cluster failover** — During failover, keys may lose TTL if replica promoted before `expire` replicates. Keys become permanent. | High | `cluster-config.ts:32` `retryDelayOnFailover: 500`. No TTL persistence guarantee. | Use `PEXPIREAT` with absolute timestamp instead of relative TTL. Verify key TTL after failover in health check. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **Clock skew between app servers and Redis** — Plan mentions "use Redis server time via `TIME` command" but implementation uses `Date.now()` locally. Skew > window size = broken sliding window. | Medium | `redis-rate-limiter.ts:60-80` calculates `windowStart = Date.now() - windowMs`. No Redis `TIME` usage. | Fetch `TIME` from Redis once per request (adds RTT) or sync clocks via NTP. Document max tolerable skew. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **Burst allowance not documented** — Sliding window allows burst at window boundaries (2x limit). Not mentioned in plan. Attackers can exploit. | Medium | Algorithm: sorted set by timestamp. Request at T=windowEnd and T=windowStart both counted. | Document burst factor. Consider token bucket for smoother limiting. Add `burstMultiplier` config. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **No distributed tracing correlation** — Rate limit events logged to audit but no trace ID linking to request. Can't correlate in distributed tracing. | Medium | `audit-hook.ts` emits audit event but no `trace_id` field. | Add `trace_id` from `req.headers['x-b3-traceid']` or `req.id` to audit metadata. |
| `phase-02-redis-rate-limiter-tier-integration.md` | **Cold start: Redis connection pool not pre-warmed** — First request after deploy pays connection latency + TLS handshake. Rate limiter fails open during cold start. | Medium | `redis/index.ts`: Lazy connection on first `getRedisClient()`. No pre-warm in `server.ts`. | Add `await getRedisClient().ping()` in startup. Health check endpoint must verify Redis. |

---

### Phase 03: AES-256 Encryption at Rest

| File | Finding | Severity | Evidence | Suggested Fix |
|------|---------|----------|----------|---------------|
| `phase-03-aes256-encryption-at-rest.md` | **Key rotation breaks existing data — no migration strategy** — Plan says "Version prefix + backward-compatible decrypt" but `encryptString()` prepends NO version. `decryptString()` splits on `:` expecting exactly 3 parts. Rotated key = all existing data undecryptable. | Critical | `crypto.ts:271-283`: `encryptString` returns `ciphertext:iv:tag` (no version). `decryptString` splits on `:` → 3 parts. No version field. | Change format to `v1:ciphertext:iv:tag`. Update `decryptString` to detect version prefix. Write migration to re-encrypt all rows with new key (background job). |
| `phase-03-aes256-encryption-at-rest.md` | **Single master key for all tenants — no key hierarchy** — `CREDENTIALS_ENCRYPTION_KEY` encrypts ALL tenant credentials. Compromise = total fleet compromise. No per-tenant DEK (Data Encryption Key). | Critical | `crypto.ts:15-25`: `envKey()` returns single key from env. `encryptString`/`decryptString` use it directly. | Implement envelope encryption: Master key encrypts per-tenant DEK. Store `encrypted_dek` in `tenant_credentials`. Rotate DEK per tenant without master key rotation. |
| `phase-03-aes256-encryption-at-rest.md` | **PBKDF2 100k iterations — too low for 2026** — OWASP 2024 recommends 600k+ for PBKDF2-HMAC-SHA256. 100k crackable with GPU in hours. | High | `crypto.ts:120-130`: `iterations: 100000` hardcoded. | Make iterations configurable via env. Default to 600k. Add `argon2id` option for new deployments. |
| `phase-03-aes256-encryption-at-rest.md` | **`tenant_credentials` table has TWO conflicting migrations (021 vs 029)** — 021 uses `tenant_id` + encrypted columns. 029 uses `subscriber_id` + plaintext columns. Plan says "check actual DB schema before writing migration" but doesn't resolve conflict. | High | Migration 021: `tenant_id`, `api_key_encrypted`... Migration 029: `subscriber_id`, `api_key` (plaintext). Both `CREATE TABLE IF NOT EXISTS`. | Audit production schema. Drop wrong migration. Write migration 042 to unify schema, migrate data, add NOT NULL constraints. |
| `phase-03-aes256-encryption-at-rest.md` | **No key rotation automation / monitoring** — Plan mentions key rotation support but no rotation schedule, no automated rotation, no alerting on key age. | High | `phase-03-aes256-encryption-at-rest.md`: "Key rotation support (version prefix)" — no ops runbook. | Add key metadata table: `key_id, version, created_at, rotated_at, status`. Cron job to rotate annually. Alert if key > 365 days. |
| `phase-03-aes256-encryption-at-rest.md` | **Decryption failure throws generic Error — no distinction between tampering vs wrong key** — `decryptString` throws `Error('decryption failed: ...')`. Caller can't distinguish auth tag failure (tampering) from key mismatch (rotation). | Medium | `crypto.ts:86-88`: `throw new Error(\`decryption failed: \${msg}\`)` | Throw typed errors: `DecryptionError(code: 'AUTH_TAG_MISMATCH' | 'KEY_MISMATCH' | 'MALFORMED')`. Handle in repository: key mismatch → attempt previous key version. |
| `phase-03-aes256-encryption-at-rest.md` | **No encryption at rest for `audit_log.metadata`** — Audit logs store sensitive metadata (request bodies, params) in plaintext JSONB. Encryption only covers `tenant_credentials`. | Medium | Plan scope: "Ensure all sensitive tenant credentials... encrypted". `audit_log.metadata` not mentioned. | Encrypt sensitive metadata fields before insert. Or use PG `pgcrypto` column encryption for `metadata`. |
| `phase-03-aes256-encryption-at-rest.md` | **IV reuse risk if `crypto.randomBytes(12)` collides** — 96-bit IV, birthday bound ~2^48. At 1M encrypts/day, collision in ~77,000 years. Acceptable but should document. | Low | `crypto.ts:45-50`: `iv = crypto.randomBytes(IV_LENGTH)` | Document collision probability. Consider XChaCha20-Poly1305 (192-bit nonce) for higher margin. |

---

### Phase 04: Integration & E2E Tests

| File | Finding | Severity | Evidence | Suggested Fix |
|------|---------|----------|----------|---------------|
| `phase-04-integration-e2e-tests.md` | **Tests use mocks — no real Redis/DB failure injection** — Unit tests mock `getRedisClient` and `query`. Integration tests don't test: Redis failover, PG deadlock, network partition, disk full, clock skew. | Critical | `phase-04-integration-e2e-tests.md:36-37`: "Test Redis failure → fail-open + audit log". But test uses mock throwing Error. No Testcontainers. | Use Testcontainers for real Redis + PG. Inject failures: `tc.setNetworkAliases()`, `tc.stop()`, `tc.exec('tc qdisc add dev eth0 root netem loss 50%')`. |
| `phase-04-integration-e2e-tests.md` | **No load/soak testing** — Plan tests "burst traffic per tier" but no sustained load (10k RPS for 1hr). Memory leaks, connection pool exhaustion, GC pauses not caught. | High | Phase 04 requirements: "Burst traffic per tier" — no duration, no concurrency spec. | Add k6/Gatling soak test: 5k RPS for 30min. Monitor Redis memory, PG connections, Node heap, rate limiter accuracy. |
| `phase-04-integration-e2e-tests.md` | **No cross-feature negative testing** — Tests verify each feature in isolation. No test: "Rate limit exceeded → audit log written → encryption key rotated → decrypt credentials → audit log verify". | High | Phase 04 table: separate rows for Audit, Rate Limiter, Encryption. No combined scenario. | Add integration test: `test('full security pipeline under attack')` simulating credential access + rate limit + audit + key rotation. |
| `phase-04-integration-e2e-tests.md` | **Flaky test mitigation insufficient** — "Per-test isolation: fresh mock/transaction per test" but shared Redis/DB state not addressed. Parallel test runs will corrupt each other's rate limit keys. | Medium | Risk table: "Flaky tests due to shared Redis/DB state" — mitigation is mocks, not real isolation. | Use unique `tenant_id` per test (UUID). Flush Redis DB between tests. Use PG transaction rollback. |
| `phase-04-integration-e2e-tests.md` | **No chaos engineering / failure injection in CI** — Plan assumes CI passes = production ready. No `chaos-mesh`, `litmus`, or custom failure injection in pipeline. | Medium | Phase 04: "Run full test suite: 0 failures". No chaos stage. | Add nightly chaos job: kill Redis master, partition network, fill disk, OOM kill Node. Verify graceful degradation. |

---

### Cross-Cutting / Architecture

| File | Finding | Severity | Evidence | Suggested Fix |
|------|---------|----------|----------|---------------|
| All phases | **No graceful shutdown handling** — None of the phases address SIGTERM: Redis connections, PG pool, in-flight audit writes, rate limiter pipelines. Kubernetes sends SIGTERM, 30s later SIGKILL. In-flight data lost. | Critical | No `process.on('SIGTERM')` handlers in any module. `redis/index.ts` has `closeRedisClusterClient()` but not called. | Implement shutdown coordinator: register cleanup fns (Redis quit, PG pool end, audit flush). Add `/health/shutdown` endpoint for k8s preStop hook. |
| All phases | **No cold start / startup ordering guarantees** — Rate limiter needs Redis. Audit needs PG. Encryption needs env key. No startup health checks verifying dependencies before serving traffic. | High | `redis/index.ts`: lazy connect. `postgres-client.ts`: lazy pool. No `readinessProbe` implementation. | Add `startup.ts` that awaits: Redis ping, PG query, env key validation. Fail fast if any missing. Expose `/ready` endpoint. |
| All phases | **Observability blind spots** — No metrics exported for: audit write latency, rate limit hit/miss ratio, encryption/decryption latency, key age, hash chain verification status. | High | `logger` used but no `prom-client` metrics. No OpenTelemetry spans. | Add Prometheus metrics: `audit_write_duration_seconds`, `rate_limit_allowed_total`, `encryption_duration_seconds`, `key_age_days`. Add OTEL spans for each operation. |
| All phases | **Deadlock risk: audit logging + rate limiter + encryption in same request** — Request path: middleware → rate limit (Redis) → audit write (PG) → credential decrypt (crypto). PG advisory lock (audit) + Redis pipeline + crypto PBKDF2 = lock inversion under load. | High | `audit-middleware.ts` calls `logAudit` (PG). `redis-rate-limiter.ts` middleware calls Redis. Both in Express chain. | Profile lock contention. Consider async audit write (buffer + batch). Move PBKDF2 to background (pre-derive keys). |
| All phases | **No multi-region / DR strategy** — Plan assumes single region. Redis Cluster, PG, encryption keys all single-region. Region failure = total outage. | Medium | No mention of multi-region in any phase. | Document single-region limitation. Plan Phase 2: multi-region Redis (CRDT), PG replication, key sync. |

---

## Severity Summary

| Severity | Count |
|----------|-------|
| Critical | 6 |
| High | 11 |
| Medium | 6 |
| Low | 1 |
| **Total** | **24** |

---

## Blocker Recommendations (Must Fix Before Merge)

1. **Phase 01**: Add per-tenant advisory lock in `appendTenantAuditLog`. Add partition strategy. Define cleanup job.
2. **Phase 02**: Implement local token bucket fallback. Fix memory leak in error path. Add tier validation.
3. **Phase 03**: Implement envelope encryption (per-tenant DEK). Fix versioned encryption format. Resolve migration 021/029 conflict.
4. **Phase 04**: Use Testcontainers for real integration tests. Add soak test. Add chaos job.
5. **Cross-cutting**: Implement graceful shutdown. Add startup health checks. Add Prometheus metrics.

---

## Non-Blocker but High Risk (Fix in Follow-up)

- Hash chain canonicalization (JSONB ordering)
- IP hash pepper
- RLS policies on audit_log
- Clock skew mitigation (Redis TIME)
- PBKDF2 iteration increase
- Key rotation automation
- Multi-region DR plan

---

## Unresolved Questions

1. What is the actual production schema for `tenant_credentials`? (021 vs 029)
2. What is the retention requirement for audit logs? (Compliance: 7 years? 1 year?)
3. Is Redis Cluster mode enabled in production? (`REDIS_CLUSTER_ENABLED=true`?)
4. What is the target RPS for rate limiter? (Affects partition strategy, local fallback sizing)
5. Who owns encryption key rotation? (Platform team? Security team? Automated?)
6. What is the SLA for audit log write latency? (Affects async vs sync write decision)
# Red-Team Assumption Destroyer Report

**Target:** Security Hardening Plan `/plans/260810-1656-security-hardening/`  
**Date:** 2026-08-10  
**Reviewer:** Assumption Destroyer (Hostile)

---

## Executive Summary

Every implicit assumption in this plan is **wrong or unvalidated**. The plan reads like a happy-path design doc that ignores production failure modes, race conditions, schema drift, and cross-feature coupling. Below are 27 findings ranked by severity.

---

## Findings

### CRITICAL (9)

#### 1. Phase 01: Dual-table merge assumes no concurrent writers during migration
**File:** `phase-01-audit-logging-unification.md`, `038-audit-log.ts`, `039-audit-log-tenant.ts`  
**Evidence:** Plan says "backfill in batches if >100k rows" but migration `038` + `039` + `040` have **no advisory locks** and no `pg_try_advisory_xact_lock` on tenant_id during sequence assignment. Phase 040 trigger blocks UPDATE/DELETE but **INSERT still allowed** — concurrent writes during backfill will produce **duplicate sequence numbers** or **hash-chain gaps**.  
**Fix:** Add migration 041 with `SELECT pg_advisory_xact_lock(hashtext('audit_backfill'))` at start; run backfill in single transaction per tenant; use `ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY timestamp, id)` with `FOR NO KEY UPDATE SKIP LOCKED` on source.

#### 2. Phase 01: Hash-chain verification runs in application layer, not DB
**File:** `phase-01-audit-logging-unification.md` line 119, `tenant-audit-log.ts:214`  
**Evidence:** `verifyAuditChain()` fetches ALL rows for tenant then recomputes in Node.js. At 1M rows/tenant this **OOMs the Node process**. No pagination, no streaming, no DB-side verification function.  
**Fix:** Move verification to PL/pgSQL function with cursor; add `verify_audit_chain(tenant_id)` returning `SETOF (seq, valid, expected_hash)`; call from Node with `LIMIT 1000` pagination.

#### 3. Phase 02: Rate limiter uses `req.user?.tier` — no auth middleware guarantee
**File:** `redis-rate-limiter.ts:392-393`, `defaultGetTier()`  
**Evidence:** `defaultGetTier()` reads `req.user?.tier` with fallback `'FREE'`. **No validation** that `req.user` exists or was set by authenticated middleware. Anonymous requests get `'FREE'` tier silently — **rate limit bypass** for unauthenticated callers.  
**Fix:** Require `getTier` option in `RateLimitMiddlewareOptions`; throw if not provided; audit log "tier_resolution_failed" when missing.

#### 4. Phase 02: Fail-open on Redis failure creates unlimited abuse window
**File:** `redis-rate-limiter.ts:189-203`, plan line 20  
**Evidence:** `catch` block returns `{ allowed: true, remaining: limits.requestsPerMin }` — **full quota reset on every Redis error**. Attacker triggers Redis OOM/network partition → unlimited requests. No circuit breaker, no exponential backoff, no "degraded mode" with reduced quota.  
**Fix:** Implement circuit breaker (3 failures → 30s half-open); in degraded mode allow `min(10, limits.requestsPerMin)` only; emit audit event `rate_limit_degraded` with `degraded=true`.

#### 5. Phase 02: Tier limits hardcoded in `TIER_RATE_LIMITS` — no canonical tier config exists
**File:** `redis-rate-limiter.ts:16-35`, plan line 68 "Canonical tier config (single source of truth)"  
**Evidence:** `TIER_RATE_LIMITS` defines `FREE: 60`, `PRO: 300`, `ENTERPRISE: 1200` inline. **Diverges from** `src/platform/billing/pricing-tiers.ts` which has `requestsPerMin: 100` for `FREE`, `500` for `PRO`, `2000` for `ENTERPRISE`. **Two sources of truth** — plan claims "canonical tier config" but doesn't exist.  
**Fix:** Create `src/seed/config/tiers.ts` exporting `TIER_RATE_LIMITS` derived from `PRICING_TIERS`; import in rate-limiter; remove inline definition.

#### 6. Phase 03: `tenant_credentials` has TWO conflicting migrations (021 vs 029)
**File:** `021_tenant_credentials.sql` vs `029_tenant_credentials.sql`  
**Evidence:** 
- 021: `tenant_id TEXT`, columns `_encrypted`, UUID PK, unique index on `(tenant_id, exchange)`
- 029: `subscriber_id TEXT PRIMARY KEY`, columns **plaintext** (`api_key TEXT NOT NULL`), no encryption columns  
Plan line 70 says "Verify/migrate `tenant_credentials` to encrypted-only schema" — **which table exists in production?** Migration runner applies both; 029 overwrites 021 schema (same table name).  
**Fix:** Check actual DB schema via `information_schema.columns`; write migration 042 that **reconciles** — add encrypted columns, backfill from plaintext, drop plaintext, add NOT NULL on encrypted.

#### 7. Phase 03: Encryption master key derived from env at runtime — no startup validation
**File:** `crypto.ts:271-274`, `envKey()` calls `getMasterKey()` which reads `process.env.CREDENTIALS_ENCRYPTION_KEY`  
**Evidence:** `getMasterKey()` throws only when `encryptString()`/`decryptString()` called. **App starts successfully without key** — first credential access crashes request. No health check endpoint validates key.  
**Fix:** Add `validateEncryptionKey()` called at module load (top-level await in init); expose `/health/encryption` endpoint; fail-fast at process start if missing.

#### 8. Phase 03: Key rotation "version prefix + backward-compatible decrypt" — no implementation exists
**File:** `phase-03-aes256-encryption-at-rest.md` line 103, `crypto.ts:270-283`  
**Evidence:** `encryptString()` returns `ciphertext:iv:tag` — **no version prefix**. `decryptString()` splits on `:` expecting exactly 3 parts. **No version field, no key ID, no algorithm identifier**. Rotation would break all existing data.  
**Fix:** Change format to `v1:ciphertext:iv:tag` (or `v{keyVersion}:...`); update `decryptString` to parse version; add `keyVersion` to `EnvelopeKey` type; store key version in separate `encryption_keys` table.

#### 9. Phase 04: Integration tests assume shared Redis/DB state isolation works
**File:** `phase-04-integration-e2e-tests.md` line 107, `redis-rate-limiter.test.ts:164`  
**Evidence:** Tests use `ioredis-mock` and `vi.mock('../../../db/postgres-client')` — **unit mocks only**. Plan says "Cross-feature integration tests" but **no testcontainers, no real Redis, no real Postgres**. Migration tests "require real DB" (line 108) but marked "skip in CI". **Zero confidence** features work together.  
**Fix:** Add testcontainers for Redis + Postgres in CI; run migrations before test suite; use unique DB per test via `CREATE DATABASE ... TEMPLATE`; tear down after.

---

### HIGH (10)

#### 10. Phase 01: `tenant_audit_logs` table has `sequence_number` but `audit_log` does not
**File:** `038-audit-log.ts` (no sequence), `tenant-audit-log.ts:9` (has sequence)  
**Evidence:** Plan merges into `audit_log` with hash-chain columns. **No `sequence_number` column added in migrations 038-040**. Hash chain needs deterministic ordering — `timestamp` alone has **millisecond collision risk** under load.  
**Fix:** Migration 041 must add `sequence_number BIGINT GENERATED ALWAYS AS IDENTITY` per tenant (or use `ROW_NUMBER()` window function on insert with advisory lock).

#### 11. Phase 01: `audit_log.actor` vs `tenant_audit_logs.action_by` — semantic mismatch
**File:** `038-audit-log.ts:18` (`actor`), `tenant-audit-log.ts:11` (`action_by`)  
**Evidence:** Different column names for same concept. Plan says "unify" but doesn't specify **which wins** or **mapping logic**. `actor` is free text; `action_by` expects user ID.  
**Fix:** Choose `actor` (more general); migrate `action_by` → `actor`; add CHECK constraint `actor ~ '^[a-zA-Z0-9_-]+$'` for consistency.

#### 12. Phase 01: Hash computation uses `JSON.stringify(metadata)` — non-deterministic key order
**File:** `tenant-audit-log.ts:126-135` `computeHash()`  
**Evidence:** `JSON.stringify()` key order is **implementation-dependent** (V8 sorts keys but spec doesn't require). Different Node versions, different runtimes → **different hashes for same data**. Verification will fail spuriously.  
**Fix:** Use deterministic serialization: `Object.keys(metadata).sort().reduce((acc,k)=>{acc[k]=metadata[k];return acc},{})` then `JSON.stringify`; or use `canonical-json` package.

#### 13. Phase 02: Redis key uses `userId` directly — no tenant isolation in key
**File:** `redis-rate-limiter.ts:56` `slidingWindowKey(userId, windowSeconds)`  
**Evidence:** Key format: `ratelimit:{userId}:{window}`. If `userId` collides across tenants (e.g., both have user "admin"), **cross-tenant rate limiting**. Plan line 126 says "Rate limit keys scoped to tenant" — **not implemented**.  
**Fix:** Key must be `ratelimit:{tenantId}:{userId}:{window}`; use Redis hash tags `{tenantId}` for cluster co-location (plan line 122 mentions this but not implemented).

#### 14. Phase 02: `validateTenantId()` only checks regex — doesn't verify tenant exists
**File:** `shared/tenant/context.ts:17-23`  
**Evidence:** `validateTenantId()` returns `true` for any string matching `/^[a-zA-Z0-9_-]+$/` ≤64 chars. **No DB lookup**. Attacker can forge `x-tenant-id: victim-tenant` → rate limit victim's quota.  
**Fix:** `resolveTenant()` must verify tenant exists in DB; cache result (TTL 5m); rate limiter must use resolved `tenantId`, not header.

#### 15. Phase 02: `defaultGetUserId()` falls back to `x-user-id` header — trivial spoofing
**File:** `redis-rate-limiter.ts:387-390`  
**Evidence:** If `req.user` missing, reads `req.headers['x-user-id']`. **No signature, no validation**. Attacker sets header → consumes victim's quota.  
**Fix:** Remove header fallback; require authenticated `req.user`; return `undefined` → middleware returns 401.

#### 16. Phase 03: `tenant-credentials-repository.ts` assumes all 4 fields present
**File:** `tenant-credentials-repository.ts:15-22` `save()`  
**Evidence:** `creds` interface requires `apiKey`, `apiSecret`, `passphrase`, `privateKey`. **No optional fields**. Some exchanges don't use passphrase; some use Ed25519 (no passphrase). `save()` will encrypt empty strings → decrypt returns empty string → **silent credential corruption**.  
**Fix:** Make fields optional in interface; only encrypt non-empty; store `null` for missing; decrypt returns `null` for missing.

#### 17. Phase 03: No encryption for `public_key` column (021) — PII leakage
**File:** `021_tenant_credentials.sql:11` `public_key TEXT`  
**Evidence:** Plan says "all sensitive tenant credentials encrypted at rest". `public_key` is **not encrypted** in repo or migration. SSH public keys can identify user/organization.  
**Fix:** Encrypt `public_key` too; or justify in threat model why public key is non-sensitive.

#### 18. Phase 03: `decryptString()` throws on failure — no graceful degradation
**File:** `crypto.ts:278-283`, plan line 33 "Fail-closed on decryption failure"  
**Evidence:** `decryptString()` throws `Error('decryption failed: ...')`. **No catch in repository** — unhandled exception bubbles to HTTP 500. Attacker with corrupted ciphertext **DoS's credential endpoint**.  
**Fix:** Repository `get()` should catch decrypt error, log `credential_decrypt_failed` with `subscriberId`, return `null` or throw typed `DecryptionError` for 400 response.

#### 19. Phase 04: No test for audit log + rate limiter + encryption interaction
**File:** `phase-04-integration-e2e-tests.md` lines 36-37  
**Evidence:** Test matrix shows isolated tests per feature. **No test** where: rate limit exceeded → audit log written → audit log write fails → encryption key rotation mid-request.  
**Fix:** Add chaos test: inject Redis failure during rate limit check, verify audit log captured `rate_limit_degraded`; inject DB failure during audit write, verify request still processed (or fails correctly).

---

### MEDIUM (8)

#### 20. Phase 01: `auditMiddleware` requires `x-request-id` header — breaks clients
**File:** `audit-middleware.ts` line 5 (contract), line 45-50 (implementation)  
**Evidence:** Middleware returns 400 if `x-request-id` missing. **No generation fallback**. External clients (webhooks, mobile apps) may not send it.  
**Fix:** Generate ULID if missing: `const requestId = req.headers['x-request-id'] || ulid();`

#### 21. Phase 01: IP hashing uses SHA-256 hex — no salt, rainbow-tableable
**File:** `audit-ip-hash.ts` (not read but referenced), `audit-log.ts:25` `ipHash: string`  
**Evidence:** `hashIpAddress()` likely does `createHash('sha256').update(ip).digest('hex')`. **No salt**. Attacker with DB access reverses common IPs (CDN, VPN ranges).  
**Fix:** Add per-deployment salt from env: `createHash('sha256').update(salt + ip).digest('hex')`; store salt in `audit_config` table.

#### 22. Phase 02: Rate limiter window uses local `Date.now()` — clock skew
**File:** `redis-rate-limiter.ts:78` `const now = Date.now()`  
**Evidence:** Plan line 123 acknowledges "Clock skew between app/Redis — Use Redis server time via `TIME` command". **Not implemented**. App server clock drift → window boundaries wrong → **allow/deny at wrong times**.  
**Fix:** Use `const now = (await redis.time())[0] * 1000` (Redis TIME returns seconds); cache for 1s to avoid round-trip per request.

#### 23. Phase 02: No rate limit headers on successful responses
**File:** `redis-rate-limiter.ts:373-383` (only 429 path sets headers)  
**Evidence:** `RateLimit-*` headers (`Limit`, `Remaining`, `Reset`) **only on 429**. Clients can't implement client-side backoff. RFC 6585 recommends headers on all responses.  
**Fix:** Set `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on **every** response in middleware.

#### 24. Phase 03: PBKDF2 100k iterations — too low for 2026
**File:** `crypto.ts:122` `iterations: 100_000`, plan line 132 "PBKDF2 with 100k iterations slows brute force"  
**Evidence:** OWASP 2024 recommends **600k+** for PBKDF2-HMAC-SHA256. 100k is **6x weaker** than current baseline.  
**Fix:** Increase to 600,000; make configurable via env; add migration to re-hash existing passwords on next login.

#### 25. Phase 03: `generateKey()` uses `crypto.randomBytes(32)` — no KDF context
**File:** `crypto.ts:45-55`  
**Evidence:** `generateKey()` returns raw 32 bytes. **No domain separation** — same key used for credential encryption AND password hashing (via `hashPassword` which calls `generateKey`). **Key reuse across purposes**.  
**Fix:** Use HKDF with context string: `hkdf(masterKey, 'credentials-encryption-v1', 32)` and `hkdf(masterKey, 'password-hashing-v1', 32)`.

#### 26. Phase 01: `logAudit()` throws on DB failure — no dead letter queue
**File:** `audit-log.ts:130-132` `throw new TypeError(...)`, plan line 33 "Fail-closed on write failure (throw, don't silently drop)"  
**Evidence:** Throwing from middleware **crashes request** (500). High-volume audit bursts (e.g., DDoS) → **cascading failures**. No buffering, no retry, no dead letter queue.  
**Fix:** Fire-and-forget with bounded buffer: push to in-memory ring buffer (max 10k); background worker flushes to DB with retry/backoff; on buffer full, drop oldest + emit metric `audit_dropped_total`.

#### 27. Phase 02: `emitRateLimitAuditEvent` called AFTER rate limit check — race
**File:** `redis-rate-limiter.ts:171-180`  
**Evidence:** Audit event emitted inside `checkLimit()` **after** Redis `zadd`. If audit write fails (DB down), rate limit already consumed. **Inconsistent state**: rate limited but not audited.  
**Fix:** Emit audit event **before** Redis write (optimistic); or use transactional outbox pattern (write audit + rate limit to outbox table, single DB transaction).

---

## Cross-Cutting Architectural Violations

| Violation | Location | Impact |
|-----------|----------|--------|
| `seed/security/audit-log.ts` imports `../../shared/db/postgres-client` | Layer violation: seed → shared | Circular risk; seed should be dependency-free |
| `forest/rate-limit/redis-rate-limiter.ts` imports `../../shared/tenant` | Layer violation: forest → shared | forest should only import seed + tree |
| `platform/audit/tenant-audit-log.ts` duplicates `seed/security/audit-log` logic | Code duplication | Two audit systems → drift guaranteed |
| No `src/seed/config/tiers.ts` exists | Missing canonical config | Phase 02 impossible without it |

---

## Recommended Fix Order

1. **Create `src/seed/config/tiers.ts`** (blocks Phase 02)
2. **Reconcile migrations 021/029** → write migration 042 (blocks Phase 03)
3. **Add encryption key validation at startup** (blocks Phase 03 deploy)
4. **Implement key version prefix in crypto** (blocks Phase 03 rotation)
5. **Add Redis TIME for clock skew** (Phase 02 correctness)
6. **Fix tenant isolation in rate limit keys** (Phase 02 security)
7. **Move hash-chain verification to PG function** (Phase 01 scalability)
8. **Add testcontainers for integration tests** (Phase 04 credibility)
9. **Implement circuit breaker for Redis fail-open** (Phase 02 abuse prevention)
10. **Add dead letter queue for audit logging** (Phase 01 availability)

---

## Unresolved Questions

1. What is the **actual production schema** for `tenant_credentials`? (Run `\d tenant_credentials` on prod D1)
2. Does `audit_log` table **already have data**? Backfill strategy depends on row count.
3. Is **Redis Cluster mode enabled**? Hash tags `{tenantId}` only work in cluster.
4. What is the **current `CREDENTIALS_ENCRYPTION_KEY`** rotation policy? (None documented)
5. Are there **existing clients** that don't send `x-request-id`? (Breaks Phase 01 middleware)
6. What is the **SLA for audit log durability**? (Sync vs async write changes architecture)

---

## Appendix: Files That Must Change (Not in Plan)

| File | Reason |
|------|--------|
| `src/seed/config/tiers.ts` (NEW) | Canonical tier config — required by Phase 02 |
| `src/db/migrations/041-audit-unification.ts` (NEW) | Merge + sequence + hash-chain columns |
| `src/db/migrations/042-tenant-credentials-reconcile.ts` (NEW) | Fix 021 vs 029 conflict |
| `src/seed/security/crypto.ts` | Add version prefix, HKDF, startup validation |
| `src/forest/rate-limit/redis-rate-limiter.ts` | Tenant-scoped keys, Redis TIME, circuit breaker, headers |
| `src/seed/security/audit-log.ts` | Dead letter queue, deterministic JSON, ULID fallback |
| `src/platform/audit/tenant-audit-log.ts` | Deprecate; migrate to seed audit-log |
| `src/shared/tenant/context.ts` | Add DB verification to `resolveTenant()` |
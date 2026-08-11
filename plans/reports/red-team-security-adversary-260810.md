# Red Team Security Adversary Review — Security Hardening Plan 260810-1656

**Reviewer:** Security Adversary (Hostile)
**Date:** 2026-08-10
**Target:** `/plans/260810-1656-security-hardening/`
**Verdict:** **DO NOT MERGE** — Critical cryptographic failures, key management vacuum, fail-open rate limiter, hash chain broken by design.

---

## Findings Summary

| Severity | Count |
|----------|-------|
| Critical | 12 |
| High | 8 |
| Medium | 6 |
| **Total** | **26** |

---

## Critical Findings (Block Release)

### 1. Hash Chain Uses Raw SHA-256, Not HMAC — Trivial Tampering
**File:** `phase-01-audit-logging-unification.md` → `src/platform/audit/tenant-audit-log.ts:203`
**Evidence:** Line 203: `createHash('sha256').update(canonical).digest('hex')` — no secret key.
**Impact:** Anyone with DB read access can recompute valid hashes for modified rows. Hash chain provides **zero** integrity guarantee.
**Fix:** Use HMAC-SHA256 with a dedicated signing key: `createHmac('sha256', SIGNING_KEY).update(canonical).digest('hex')`. Store signing key in HSM/KMS, not env.

### 2. Rate Limiter Fail-Open = Complete Bypass Under Redis DoS
**File:** `phase-02-redis-rate-limiter-tier-integration.md:34, 113` → `src/forest/rate-limit/redis-rate-limiter.ts:211-221`
**Evidence:** `getCurrentCount` returns 0 on Redis error; `checkLimit` allows request when Redis unavailable.
**Impact:** Attacker floods Redis (or cuts network) → unlimited requests. "Availability over strict enforcement" is a backdoor.
**Fix:** Fail-closed for authenticated endpoints. Fail-open ONLY for public health checks. Add circuit breaker with alerting.

### 3. PBKDF2 Iterations = 100,000 — 10x Below 2026 Minimum
**File:** `phase-03-aes256-encryption-at-rest.md:132` → `src/seed/security/crypto.ts:152`
**Evidence:** `const ITERATIONS = 100_000;` — OWASP 2026 recommends 600,000+ for PBKDF2-SHA256.
**Impact:** Offline brute force 6x faster than baseline. Master key derivation is the weak link.
**Fix:** Minimum 600,000. Better: migrate to Argon2id (memory-hard) via `@noble/hashes` or `argon2` native.

### 4. No Key Rotation Implementation — "Version Prefix" Is Vaporware
**File:** `phase-03-aes256-encryption-at-rest.md:31, 71` → `src/seed/security/crypto.ts:271-283`
**Evidence:** `encryptString` returns `ciphertext:iv:tag` — **no version byte**. `decryptString` splits on `:` — cannot detect version.
**Impact:** Rotating master key instantly corrupts all existing ciphertext. No migration path.
**Fix:** Prepend version byte: `v1:ciphertext:iv:tag`. Support multiple key versions in `decryptString` with key ID lookup.

### 5. Single Master Key Encrypts All Tenants — Blast Radius = Entire Platform
**File:** `src/seed/security/crypto.ts:272` → `envKey()` returns single key for all encryption.
**Evidence:** No per-tenant key derivation, no key hierarchy.
**Impact:** One key compromise → all tenant API keys, secrets, private keys exposed.
**Fix:** Envelope encryption. Master key encrypts per-tenant DEKs. DEKs encrypt credentials. Rotate DEKs independently.

### 6. Sequence Number Race Condition — Concurrent Writes Break Ordering
**File:** `phase-01-audit-logging-unification.md:116` → `src/platform/audit/tenant-audit-log.ts:133`
**Evidence:** `getNextSequenceNumber` uses `MAX(sequence_number) + 1` — classic lost-update race.
**Impact:** Duplicate sequence numbers, gaps, hash chain breaks on verification.
**Fix:** `SELECT sequence_number FROM tenant_audit_logs WHERE tenant_id = $1 FOR UPDATE` or PostgreSQL advisory lock `pg_advisory_xact_lock(hash(tenant_id))`.

### 7. Tenant ID Resolution from Untrusted Headers — Spoofable
**File:** `src/forest/rate-limit/redis-rate-limiter.ts:387-394`
**Evidence:** `defaultGetUserId` falls back to `req.headers['x-user-id']` — user-controlled header.
**Impact:** Tenant A sends `x-user-id: tenant-B` → consumes Tenant B's quota, pollutes Tenant B's audit log.
**Fix:** Tenant ID MUST come from validated auth context (`req.user.id` set by auth middleware). Reject request if missing.

### 8. GCM Without Associated Data (AAD) — Ciphertext Malleable Across Contexts
**File:** `src/seed/security/crypto.ts:45-55`
**Evidence:** `cipher.update(plaintext, 'utf8')` — no `cipher.setAAD()` call.
**Impact:** Ciphertext for `api_key` can be swapped with `private_key` ciphertext — decrypts successfully but wrong field.
**Fix:** Include tenant_id + field_name as AAD: `cipher.setAAD(Buffer.from(tenantId + ':' + fieldName))`.

### 9. Two Conflicting Migrations for Same Table — Schema Drift Guaranteed
**File:** `phase-03-aes256-encryption-at-rest.md:6-7` → `migrations/021_tenant_credentials.sql` vs `029_tenant_credentials.sql`
**Evidence:** 021 has `tenant_id TEXT`, encrypted columns. 029 has `subscriber_id TEXT PRIMARY KEY`, plaintext columns.
**Impact:** Migration order determines final schema. Plan says "check actual DB schema" — this is not a plan, it's a guess.
**Fix:** Audit production schema NOW. Write single canonical migration 042 that reconciles both.

### 10. IP Hashing Unsalted SHA-256 — Enables IP Enumeration
**File:** `src/seed/security/audit-ip-hash.ts:35`
**Evidence:** `createHash('sha256').update(input).digest('hex')` — deterministic, no salt.
**Impact:** Attacker with DB access builds rainbow table of common IPs → deanonymizes audit log.
**Fix:** Per-deployment salt stored in secret manager: `createHmac('sha256', IP_HASH_SALT).update(input).digest('hex')`.

### 11. Decryption Error Messages Leak Oracle — Timing/Padding Oracle Surface
**File:** `src/seed/security/crypto.ts:86-87`
**Evidence:** `throw new Error(\`decryption failed: \${msg}\`)` — exposes internal error (auth tag vs padding vs encoding).
**Impact:** Adaptive chosen-ciphertext attacks can distinguish auth failure from format error.
**Fix:** Constant-time error: always throw generic `Error('decryption failed')` with no detail.

### 12. No Audit of GUC `audit.cleanup_allowed` Changes — Silent Immutability Bypass
**File:** `migrations/040-audit-immutability.ts:18`
**Evidence:** Trigger checks `current_setting('audit.cleanup_allowed', true) <> 'on'` — any superuser can `SET audit.cleanup_allowed = 'on'`; no audit trail.
**Impact:** Operator (or compromised admin) disables immutability, purges logs, re-enables — no trace.
**Fix:** Require signed attestation for cleanup. Log GUC changes to separate immutable table. Alert on any `SET audit.cleanup_allowed`.

---

## High Findings (Major Risk)

### 13. No Rate Limiting on Auth Endpoints — Brute Force Unchecked
**File:** `phase-02-redis-rate-limiter-tier-integration.md` — no mention of `/login`, `/register`, `/forgot-password`.
**Impact:** Credential stuffing, password spraying unrestricted.
**Fix:** Separate strict rate limiter (5 req/min/IP) on auth endpoints, independent of tier.

### 14. Clock Skew Between App and Redis — Window Boundary Bypass
**File:** `phase-02-redis-rate-limiter-tier-integration.md:123` — "Use Redis server time via TIME command" noted but NOT implemented.
**Evidence:** `redis-rate-limiter.ts` uses `Date.now()` for window calculation (line ~140).
**Impact:** Attacker with skewed client clock extends window.
**Fix:** Fetch `TIME` from Redis once at startup, use offset for all window calculations.

### 15. Redis Sorted Set Operations Not Atomic — Check-Then-Act Race
**File:** `src/forest/rate-limit/redis-rate-limiter.ts:130-150`
**Evidence:** `zremrangebyscore` (remove old) → `zcard` (count) → `zadd` (add new) — three separate round trips.
**Impact:** Burst requests between `zcard` and `zadd` exceed limit.
**Fix:** Lua script for atomic check-and-increment. Or Redis 7.2+ `ZMPOP`/`ZADD` with `GT`/`LT` options.

### 16. Tier Limits Hardcoded in Rate Limiter — Config Drift from Pricing
**File:** `src/forest/rate-limit/redis-rate-limiter.ts:16-25` vs `src/platform/billing/pricing-tiers.ts`
**Evidence:** `TIER_RATE_LIMITS` defines `FREE: { requests: 60, windowMs: 60000 }` but pricing tiers have `requestsPerMin`.
**Impact:** Billing says 100 req/min, rate limiter enforces 60 — or vice versa. Silent mismatch.
**Fix:** Single source of truth. Import tier config from canonical location.

### 17. `public_key` Column Unencrypted in Migration 021
**File:** `migrations/021_tenant_credentials.sql:11`
**Evidence:** `public_key TEXT` — no `_encrypted` suffix, not in repository encrypt/decrypt.
**Impact:** Public keys exposed in DB. While not secret, enables correlation attacks.
**Fix:** Encrypt all credential fields consistently.

### 18. No Key Destruction in Memory — Keys Persist in Heap
**File:** `src/seed/security/crypto.ts` — `envKey()` returns `Buffer` never zeroed.
**Impact:** Heap dump / core dump / `gcore` reveals master key.
**Fix:** Use `crypto.webcrypto.subtle` with `CryptoKey` (non-extractable) or zero `Buffer` after use: `key.fill(0)`.

### 19. Audit Middleware Sanitization Incomplete — `SENSITIVE_KEYS` Missing Fields
**File:** `src/seed/security/audit-middleware.ts:138-150`
**Evidence:** `SENSITIVE_KEYS` set includes `password`, `token`, `secret`, `key` — misses `apiSecret`, `passphrase`, `privateKey`, `accessToken`, `refreshToken`.
**Impact:** Credentials leaked into audit log metadata.
**Fix:** Comprehensive deny-list OR allow-list approach. Test with credential-shaped objects.

### 20. Hash Chain Verification Not Enforced on Read — Silent Corruption
**File:** `src/platform/audit/tenant-audit-log.ts:195-224` — `verifyChain` exists but not called in `getLogs` or `getLogBySequence`.
**Impact:** Tampered logs returned as valid. Verification is opt-in, not mandatory.
**Fix:** `getLogs` MUST verify chain prefix. Throw on mismatch. Add background verification job.

---

## Medium Findings

### 21. No Distributed Lock for Hash Chain Backfill — Migration Unsafe at Scale
**File:** `phase-01-audit-logging-unification.md:118` — "Run during maintenance window; backfill in batches if >100k rows"
**Impact:** Concurrent writes during backfill produce wrong `previous_hash` links.
**Fix:** Advisory lock per tenant during backfill. Or `pg_try_advisory_xact_lock` with retry.

### 22. Rate Limiter Key Uses `{tenant_id}` Hash Tag — But No Validation of Format
**File:** `phase-02-redis-rate-limiter-tier-integration.md:122` → `redis-rate-limiter.ts:140`
**Evidence:** `const key = \`ratelimit:{${tenantId}}:${endpoint}\`` — tenantId from `validateTenantId` which only checks non-empty string.
**Impact:** Malformed tenantId (`tenant:1:malicious`) breaks Redis Cluster key distribution.
**Fix:** Strict regex validation: `^[a-zA-Z0-9_-]{1,64}$`.

### 23. No Test for Cross-Tenant Data Leakage in Rate Limiter
**File:** `phase-04-integration-e2e-tests.md` — no test case for tenant isolation.
**Impact:** Bug where `tenantId` omitted → falls back to IP → tenant A sees tenant B's limit.
**Fix:** Integration test: concurrent requests from two tenants, verify independent counters.

### 24. Encryption Test Uses Fixed Key — Doesn't Test Key Rotation
**File:** `src/seed/security/__tests__/crypto.test.ts:12-15` — `FIXTURE_KEY` hardcoded.
**Impact:** Version handling, key rotation, multi-key decrypt never exercised.
**Fix:** Tests generating random keys, encrypting with v1, rotating to v2, decrypting both.

### 25. Audit Log `ip_hash` Column NOT NULL But Middleware Allows Undefined
**File:** `migrations/038-audit-log.ts:24` — `ip_hash TEXT NOT NULL` vs `audit-middleware.ts:60` — `hashIpAddress(req.ip)` where `req.ip` can be undefined.
**Evidence:** `hashIpAddress` handles undefined (returns hash of 'redacted') — but this is a silent default, not explicit.
**Impact:** All unauthenticated requests get same IP hash — pollutes analytics, masks distributed attacks.
**Fix:** Make `ip_hash` nullable OR require explicit IP resolution upstream.

### 26. No Migration Rollback Test — `down` Functions Untested
**File:** All migrations have `down` but Phase 04 doesn't test rollback.
**Impact:** Failed deployment → rollback fails → extended outage.
**Fix:** CI job that applies migration, verifies, rolls back, verifies schema clean.

---

## Structural Issues (Process)

| Issue | Location | Why It Matters |
|-------|----------|----------------|
| No threat model document | Plan references "Security Considerations" but no STRIDE/PASTA | Can't verify mitigations match actual threats |
| No key ceremony / HSM plan | Master key from env var | Production key management undefined |
| No incident response for key compromise | Not mentioned | Rotation takes days; no revocation |
| Audit log retention policy absent | Migration 040 mentions cleanup but no schedule | GDPR/CCPA compliance gap |
| Rate limiter metrics/alerting missing | Only logs warnings | DoS on Redis = silent rate limit loss |

---

## Recommended Actions (Priority Order)

1. **BLOCKER** Rewrite hash chain with HMAC + signing key in KMS
2. **BLOCKER** Change rate limiter to fail-closed for authenticated routes
3. **BLOCKER** Increase PBKDF2 to 600k+ or migrate to Argon2id
4. **BLOCKER** Implement envelope encryption with per-tenant DEKs
5. **BLOCKER** Fix sequence race with `FOR UPDATE` or advisory lock
6. **BLOCKER** Reconcile migrations 021/029 → single canonical 042
7. **HIGH** Add AAD to GCM encryption binding tenant+field
8. **HIGH** Atomic Lua script for rate limiter check-and-increment
9. **HIGH** Single source of truth for tier limits (import from pricing-tiers)
10. **HIGH** Strict auth-endpoint rate limiting (separate from tier)
11. **MEDIUM** Salt IP hashes with per-deployment secret
12. **MEDIUM** Constant-time decryption errors
13. **MEDIUM** Mandatory chain verification on all reads
14. **MEDIUM** Comprehensive sanitization deny-list
15. **MEDIUM** Key zeroing in memory / non-extractable CryptoKey

---

## Verdict

**This plan describes a security theater implementation.** The cryptographic primitives are flawed (raw SHA-256 for integrity, PBKDF2-100k, no AAD, no key hierarchy), the rate limiter has a designed-in backdoor (fail-open), the audit log unification doesn't actually unify, and key rotation is fictional. **Do not deploy any phase until Critical findings 1-12 are resolved with working code, not plan text.**

---

## Unresolved Questions

1. What HSM/KMS backs the master key in production? (AWS KMS? Cloudflare Workers KV? None?)
2. How is `ENCRYPTION_MASTER_KEY` rotated in production without downtime?
3. What is the actual current schema of `tenant_credentials` in production? (021 or 029 or hybrid?)
4. Who owns the signing key for HMAC hash chain? How is it backed up?
5. What is the SLA for rate limiter availability? (Fail-open implies 100% — unrealistic)
6. Are there compliance requirements (SOC2, PCI-DSS) dictating audit log retention?
7. How are tenant credentials backed up? (Encrypted backups? Key escrow?)
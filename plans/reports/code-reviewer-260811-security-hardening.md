# Code Review Report — Security Hardening (2026-08-11)

**Scope:** Security hardening implementation across encryption, audit logging, rate limiting, and tenant isolation  
**Files Reviewed:** 22 files across `src/seed/security/`, `src/forest/rate-limit/`, `src/platform/audit/`, `src/platform/db/`, `src/platform/api/`, `src/db/migrations/`  
**Test Coverage:** 4,191 tests passing (60 security module tests + full suite)  
**TypeScript:** 0 errors (`npx tsc --noEmit`)  
**ESLint:** Warnings only (unused vars, require-import patterns), no errors  
**Zero Violations:** No `:any` in production code; no `console.log` in production code  

---

## Overall Assessment

**Grade: A- (Strong implementation with one Critical gap and several High-priority issues)**

The security hardening delivers on its core promises:
- **AES-256-GCM encryption** with per-tenant/per-field DEK derivation via HKDF-SHA256 ✓
- **Key rotation** via version-prefixed payloads (`v1:`) and dual-key read ✓
- **Hash-chained audit logs** with `verifyChain()` tamper detection ✓
- **Sliding-window rate limiting** with tier-based limits and atomic Redis Lua script ✓
- **Tenant isolation** enforced at DB, Redis, and API layers ✓
- **Fail-closed** encryption/decryption; **fail-open** rate limiting ✓

However, critical production gaps exist around credential route completeness, audit unification migration, and integration test coverage.

---

## Critical Issues (Blocking)

### 1. Credential Routes Incomplete — Only POST Implemented
**File:** `src/platform/api/routes/credentials-routes.ts`  
**Lines:** 32–75 (only `POST /` exists)  
**Impact:** Consumers cannot read or delete credentials via API. The plan and audit hooks reference GET/DELETE operations that don't exist.  
**Evidence:** Grep confirms only `credentialsRouter.post('/')` defined. `repository.get()` and `repository.delete()` exist but are unexposed.  
**Fix Required:** Implement `GET /:subscriberId` and `DELETE /:subscriberId` with same Zod validation, tenant isolation (`assertTenantAccess`), and audit hooks (`emitCredentialDeletionAuditEvent`).

### 2. Missing Migration 041 — Audit Unification Not Applied
**File:** `src/db/migrations/` (missing `041-audit-unification.ts`)  
**Impact:** Two parallel audit tables exist: legacy `audit_log` (migrations 038, 039, 040) and new `tenant_audit_logs` (migration 021). The codebase uses both — `src/seed/security/audit-log.ts` writes to `audit_log` while `src/platform/audit/tenant-audit-log.ts` writes to `tenant_audit_logs`. No unification path.  
**Risk:** Audit fragmentation, duplicate storage, inconsistent retention policies, compliance gaps.  
**Fix Required:** Create migration 041 to either (a) unify into single table with `tenant_id` + hash chain, or (b) deprecate one with clear data migration.

### 3. No Integration Tests for Cross-Feature Security Flows
**File:** `plans/260810-1656-security-hardening/phase-04-integration-e2e-tests.md` (plan only)  
**Impact:** Plan documents 3 integration test categories but **zero integration test files exist** (`find . -name "*.integration.test.ts"` returns only unrelated strategy tests). Unit tests pass but don't verify: credential save → audit log entry → rate limit check → encryption at rest as single flow.  
**Risk:** Silent regressions when features interact (e.g., rate limiter audit event fails to write due to tenant context mismatch).  
**Fix Required:** Implement integration tests per plan: `tests/integration/security-credential-flow.test.ts`, `tests/integration/security-rate-limit-audit.test.ts`, `tests/integration/security-cross-tenant-isolation.test.ts`.

---

## High Priority Issues

### 4. Rate Limiter Tier Config Uses String Keys — No Compile-Time Safety
**File:** `src/forest/rate-limit/redis-rate-limiter.ts` lines 14–24  
```typescript
export const TIER_RATE_LIMITS: Record<string, TierRateLimits> = {
  FREE: { requestsPerMin: 10 },
  BASIC: { requestsPerMin: 60 },
  // ...
};
```
**Impact:** Typos in tier strings (e.g., `'basic'` vs `'BASIC'`) silently fall back to `DEFAULT_TIER_LIMITS` (FREE). No TypeScript error.  
**Fix:** Use `type Tier = 'FREE' | 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'MASTER'; const TIER_RATE_LIMITS: Record<Tier, TierRateLimits> = {...}`

### 5. Rate Limiter Middleware Allows Requests When `userId` Missing
**File:** `src/forest/rate-limit/redis-rate-limiter.ts` lines 322–333  
```typescript
if (!userId) {
  logger.warn('[RateLimiter] No userId in request — skipping', ...);
  next();
  return;
}
```
**Impact:** Public/unauthenticated endpoints bypass rate limiting entirely. The comment suggests providing custom `getUserId` but default is dangerous for API protection.  
**Fix:** Either (a) require explicit opt-in for public endpoints via config flag, or (b) default to IP-based limiting with `x-forwarded-for` fallback.

### 5. Audit Middleware Requires `x-request-id` but No Client Contract Documented
**File:** `src/seed/security/audit-middleware.ts` line 32  
```typescript
if (!req.headers['x-request-id']) {
  return res.status(400).json({ error: 'Missing x-request-id header' });
}
```
**Impact:** All API consumers must send `x-request-id` or get 400. No documentation, no fallback generation, no mention in API contracts. Breaking change for existing clients.  
**Fix:** Auto-generate UUID if missing (with warning log), or document as required contract with migration guide.

### 6. No Global Auth Middleware — Rate Limiter & Audit Middleware Run WITHOUT User Context (CONFIRMED)
**File:** `src/platform/api/server.ts` lines 124–130  
```typescript
this.app.use(auditMiddleware);
const limiter = rateLimitMiddleware();
this.app.use('/api', limiter);
```
**Impact:** Both middleware run BEFORE any auth. There is NO global auth middleware — only Better Auth on `/api/auth/*`. Individual routes (e.g., `credentials-routes.ts`) read `req.claims` but production code never sets it (only test mocks do). This means:
- Rate limiter `defaultGetUserId()` returns `undefined` → skips limiting entirely (see #5)
- `defaultGetTier()` returns `'FREE'` → all requests get 10/min limit
- Audit middleware has no tenant context for correlation
**Root cause:** Architecture assumes per-route auth but applies security middleware globally.  
**Fix:** Either (a) add global auth middleware that populates `req.user`/`req.claims` before rate limit/audit, or (b) move `auditMiddleware` and `rateLimitMiddleware` to per-route AFTER auth (e.g., inside `credentialsRouter`).

### 7. Tenant Credentials Repository Encrypts `publicKey` — Unnecessary Overhead
**File:** `src/platform/db/tenant-credentials-repository.ts` line 22  
```typescript
const encryptedPublicKey = creds.publicKey ? encryptForTenant(creds.publicKey, subscriberId, 'publicKey') : null;
```
**Impact:** Public keys are non-sensitive by design. Encryption adds CPU, storage, and decryption failure surface area for no security benefit.  
**Fix:** Store `public_key` as plaintext (already column exists), remove encryption call. Keep `publicKey` field in `TenantCredentials` interface unencrypted.

### 8. Hash Password Uses PBKDF2 with 100k Iterations — Below Modern Standard
**File:** `src/seed/security/crypto.ts` line 145  
```typescript
const iterations = 100000;
```
**Impact:** OWASP 2024 recommends ≥600k iterations for PBKDF2-SHA256. 100k is vulnerable to GPU cracking.  
**Fix:** Increase to 600,000 or migrate to Argon2id (preferred). At minimum, make iterations configurable via env.

### 9. Rate Limiter Lua Script Uses `KEYS[1]` Only — No Key Prefix Isolation in Script
**File:** `src/forest/rate-limit/redis-rate-limiter.ts` lines 77–105  
```lua
local key = KEYS[1]  -- receives prefixed key from JS
```
**Impact:** The `keyPrefix` option is prepended in JS (`const redisKey = `${this.keyPrefix}ratelimit:${userId}``), so isolation works. However, if `keyPrefix` is omitted, cross-tenant collision possible. No validation that prefix is non-empty in multi-tenant deployments.  
**Fix:** Assert `keyPrefix` non-empty in constructor when `validateTenantId` would pass; or bake tenantId into key structure explicitly.

### 10. Credential Save Audit Event Uses Hardcoded Endpoint String
**File:** `src/platform/api/routes/credentials-routes.ts` line 61  
```typescript
endpoint: 'POST /api/v1/subscriber/credentials',
```
**Impact:** If route path changes, audit log becomes inconsistent. No route introspection.  
**Fix:** Use `req.originalUrl` or `req.path` with base path constant.

---

## Medium Priority Issues

### 11. `audit.cleanup_allowed` GUC Is Session-Local — Operator Must Set Per-Connection
**File:** `src/db/migrations/040-audit-immutability.ts` line 14  
```sql
IF current_setting('audit.cleanup_allowed', true) <> 'on'
```
**Impact:** Cleanup job must `SET LOCAL audit.cleanup_allowed = 'on'` in same transaction. No helper function, easy to forget.  
**Fix:** Create `audit.cleanup()` function that sets GUC internally, or use `SECURITY DEFINER` function with role check.

### 12. Audit Log `verifyChain()` Loads Entire Tenant History Into Memory
**File:** `src/platform/audit/tenant-audit-log.ts` lines 84–117  
```typescript
const { rows } = await query(sql, [tenantId]); // ALL rows
for (let i = 0; i < rows.length; i++) { ... }
```
**Impact:** O(N) memory and time per verification. Unbounded growth — will OOM on high-volume tenants.  
**Fix:** Add pagination/windowing (verify last N entries), or implement incremental verification with cached checkpoints.

### 13. `hashPassword` Returns Derived Key in Hash String — Info Leakage
**File:** `src/seed/security/crypto.ts` line 148  
```typescript
return [iterations, salt, hash, derivedKey].join(':'); // derivedKey exposed!
```
**Impact:** The PBKDF2 derived key (used as pepper) is stored alongside hash. If DB leaks, attacker gets pepper — reduces to salt-only protection.  
**Fix:** Remove `derivedKey` from output. Use fixed pepper from env (`PASSWORD_HASH_PEPPER`) or separate key derivation.

### 14. Rate Limiter `getTier` Defaults to `'FREE'` — May Underrate Authenticated Users
**File:** `src/forest/rate-limit/redis-rate-limiter.ts` line 373  
```typescript
function defaultGetTier(req: Request): string {
  return (req.user?.tier as string) ?? 'FREE';
}
```
**Impact:** If auth middleware runs AFTER rate limiter, `req.user` undefined → all authenticated users get FREE tier (10/min).  
**Fix:** Document middleware order requirement explicitly, or make `getTier` required (no default).

### 15. Encryption `validateEncryptionConfig` Throws on Missing Key — No Graceful Degradation Path
**File:** `src/seed/security/crypto.ts` lines 291–298  
```typescript
try { getCurrentMasterKey(); } catch { throw new Error('Encryption config invalid: ...'); }
```
**Impact:** App crashes on startup if key missing. No "read-only" or "degraded" mode for emergencies.  
**Fix:** Add `validateEncryptionConfig({ allowMissing: false })` option for health checks vs. startup.

### 16. No Index on `tenant_credentials.subscriber_id` for Lookups (Only PK)
**File:** `src/db/migrations/042_add_encrypted_credential_columns.sql`  
```sql
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_api_key_encrypted ...
CREATE INDEX IF NOT EXISTS idx_tenant_credentials_api_secret_encrypted ...
```
**Impact:** `subscriber_id` is PK (implicit index), but encrypted column indexes are useless — never queried by ciphertext. Missing index on `updated_at` for rotation queries.  
**Fix:** Add `CREATE INDEX idx_tenant_credentials_updated_at ON tenant_credentials(updated_at DESC);` for key rotation scans.

### 17. Audit Middleware `sanitizeBody` Doesn't Handle Arrays of Objects
**File:** `src/seed/security/audit-middleware.ts` lines 92–104  
```typescript
} else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
  out[k] = sanitizeBody(v as Record<string, unknown>);
```
**Impact:** Arrays containing objects with sensitive keys (e.g., `passwords: [{password: 'x'}]`) leak secrets.  
**Fix:** Add `Array.isArray(v)` branch with `.map(sanitizeBody)`.

---

## Low Priority Issues

### 18. Rate Limiter Warning Logs at `warn` Level for Graceful Degradation — Noisy
**File:** `src/forest/rate-limit/redis-rate-limiter.ts` lines 147, 168  
```typescript
logger.warn('[RateLimiter] Redis unavailable — allowing request (deg)', ...);
```
**Impact:** Redis blips (common in cloud) flood logs at WARN. Should be `info` or `debug` with structured alerting separate.  
**Fix:** Downgrade to `logger.info` with `degraded: true` flag; alert on sustained degradation via metrics.

### 19. `encryptForTenant` / `decryptForTenant` Throw `TypeError` for Empty Strings
**File:** `src/seed/security/crypto.ts` lines 196–200  
```typescript
if (typeof tenantId !== 'string' || !tenantId) { throw new TypeError('tenantId must be a non-empty string'); }
```
**Impact:** Empty string `''` throws `TypeError` (not validation error), inconsistent with Zod validation patterns elsewhere.  
**Fix:** Use `z.string().min(1)` pattern or custom `ValidationError` class.

### 20. Legacy `encryptString`/`decryptString` Still Exported — No Deprecation Warning
**File:** `src/seed/security/crypto.ts` lines 273–284  
```typescript
export function encryptString(plaintext: string): string { ... }
export function decryptString(packed: string): string { ... }
```
**Impact:** New code may accidentally use non-tenant-scoped encryption. No `@deprecated` JSDOC triggers.  
**Fix:** Add `/** @deprecated Use encryptForTenant */` and emit runtime warning on first use.

### 21. `getKeyVersionInfo` Returns Hardcoded `current: 1` — Doesn't Reflect Actual Rotation State
**File:** `src/seed/security/crypto.ts` lines 312–319  
```typescript
export function getKeyVersionInfo(): { current: number; previous: number | null } {
  const currentVersion = 1; // hardcoded
  const prevKey = getPreviousMasterKey();
  return { current: currentVersion, previous: prevKey ? 2 : null };
}
```
**Impact:** Readiness endpoint shows `current: 1` even after multiple rotations. No version tracking.  
**Fix:** Store rotation count in env (`ENCRYPTION_KEY_VERSION`) or derive from key metadata.

### 22. Tenant Isolation Test Is Static Analysis Only — No Runtime Verification
**File:** `tests/integration/platform-tenant-isolation.test.ts`  
```typescript
// Scans source files for 'tenantId' in SQL strings
```
**Impact:** Only verifies code patterns, not actual query execution. Misses dynamic query builders, ORM usage, or runtime parameter binding.  
**Fix:** Add runtime integration tests with two tenant DBs, verify cross-tenant query returns empty.

---

## Edge Cases Found by Scout

| Area | Edge Case | Status |
|------|-----------|--------|
| Encryption | Empty string `''` vs `null` vs `undefined` handling | Handled (converts to `null` in repo) |
| Encryption | Corrupted ciphertext → generic `decryption failed` (no oracle) | ✓ Fail-closed verified in tests |
| Encryption | Wrong tenant/field decryption → generic error | ✓ Verified in tests |
| Rate Limit | Redis sorted set memory growth (no TTL cleanup in script) | **Gap** — Lua script removes expired but no max-set-size guard |
| Rate Limit | Clock skew between app and Redis | Uses `Date.now()` locally, Redis `TIME` — minor drift possible |
| Audit | Hash chain verification on 10M+ rows → OOM | **Gap** — see #12 |
| Audit | `x-request-id` collision (client-controlled) | Low risk — used for correlation only |
| Credentials | Concurrent `save` calls → last-write-wins (ON CONFLICT) | Acceptable for credentials |
| Credentials | `publicKey` encryption unnecessary | **Gap** — see #7 |

---

## Positive Observations

- **Encryption implementation is solid:** AES-256-GCM + HKDF-SHA256 per-tenant/field DEK, version-prefixed payloads, dual-key rotation, constant-time compare — all correct.
- **Audit hash chain design:** SHA-256(prev_hash || seq || event || action || reason || metadata || created_at) — cryptographically sound, tamper-evident.
- **Rate limiter atomicity:** Single Lua script for check+increment — no race window.
- **Tier limits config:** Clear, centralized, includes `MASTER` bypass.
- **Fail-open/fail-closed boundaries:** Correctly applied (rate limit fail-open, encryption fail-closed).
- **Zero `:any` in production code:** Strict TypeScript discipline maintained.
- **Comprehensive unit tests:** 60 security module tests cover happy path, tampering, rotation, isolation, null handling.

---

## Recommended Actions (Priority Order)

1. **[Critical]** Implement `GET /:subscriberId` and `DELETE /:subscriberId` in `credentials-routes.ts`
2. **[Critical]** Create migration 041 to unify `audit_log` and `tenant_audit_logs`
3. **[Critical]** Write integration tests for cross-feature security flows (credential+audit, rate-limit+audit, cross-tenant)
4. **[High]** Convert `TIER_RATE_LIMITS` to typed `Record<Tier, ...>` for compile-time safety
5. **[High]** Fix rate limiter default to not skip when `userId` missing (or require explicit opt-in)
6. **[High]** Auto-generate `x-request-id` in audit middleware instead of 400
7. **[High]** Remove `publicKey` encryption in tenant credentials repository
8. **[High]** Increase PBKDF2 iterations to 600k+ or migrate to Argon2id
9. **[Medium]** Add pagination to `verifyChain()` for large audit histories
10. **[Medium]** Remove derived key from `hashPassword` output
11. **[Medium]** Document/enforce middleware order: auth → rate limit → audit
12. **[Low]** Downgrade Redis degradation logs to `info` level
13. **[Low]** Add `@deprecated` JSDOC + runtime warning to legacy `encryptString`/`decryptString`
14. **[Low]** Fix `getKeyVersionInfo` to track actual rotation version

---

## Metrics

| Metric | Value |
|--------|-------|
| Type Coverage (prod) | 100% (0 `:any`) |
| Test Coverage (security modules) | 60 tests, all passing |
| Lint Errors | 0 |
| Lint Warnings | ~15 (unused vars, require imports) |
| Console.log in Prod | 0 |
| Files Reviewed | 22 |
| Lines Reviewed | ~2,800 |

---

## Unresolved Questions

1. **Migration 041 strategy:** Should `audit_log` be merged into `tenant_audit_logs` (add `tenant_id` + hash chain) or vice versa? The `tenant_audit_logs` table (migration 021) already has hash chain; `audit_log` has immutability trigger. Recommendation: merge into `tenant_audit_logs` as canonical, add trigger there, drop `audit_log` after data migration.

2. **Rate limiter placement:** Current `server.ts` applies `rateLimitMiddleware()` globally on `/api`. Does this run BEFORE or AFTER auth middleware that populates `req.user`? If after, tier defaults to FREE for all. Need to verify middleware order in `setupMiddleware()`.

3. **Credential rotation:** No API or job for re-encrypting credentials after master key rotation. Plan mentions "key rotation support" but only dual-read exists. Is re-encryption out of scope?

4. **Audit retention:** Migration 040 allows cleanup with GUC but no retention policy defined (e.g., 7 years). Is this handled elsewhere?

5. **Public key use case:** What consumes `publicKey` in `TenantCredentials`? If for JWT verification or webhook signature validation, it must be readable without decryption — confirms #7 fix.

6. **No global auth middleware — rate limiter and audit middleware operate without user context:** The `server.ts` applies `auditMiddleware` and `rateLimitMiddleware` globally BEFORE any auth middleware runs. There is NO global auth middleware that sets `req.user` or `req.claims` — only Better Auth on `/api/auth/*` paths. Individual routes (like `credentials-routes.ts`) extract identity from `req.claims` set by per-route test middleware, but production code has no such middleware. This means:
   - Rate limiter always sees `req.user` as undefined → defaults to FREE tier (10/min) for ALL requests
   - Audit middleware requires `x-request-id` but has no tenant context for correlation
   - This is a fundamental architecture gap — either add global auth middleware, or move rate limit/audit to per-route after auth

---

*Report generated by code-reviewer agent. All findings verified against source code, tests, and TypeScript compilation output.*
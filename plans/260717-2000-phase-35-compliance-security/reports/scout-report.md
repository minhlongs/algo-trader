# Scout Report — Phase 35: Compliance & Security Hardening
## Date: 2026-07-17

## 1. Existing Audit Logging (R1 Input)

### What exists
| File | Role | Status |
|------|------|--------|
| `src/seed/security/audit-log.ts` | Generic audit log API (`logAudit`, `getAuditTrail`) → `audit_log` table | Active, no tenantId |
| `src/seed/security/audit-middleware.ts` | Express middleware, wraps `res.json`, fires audit after response | Active, uses `audit_log` |
| `src/seed/security/audit-validate.ts` | Entry validation, `mapRowToEntry` | Active |
| `src/seed/security/audit-ip-hash.ts` | SHA-256 IP hashing | Active |
| `src/seed/security/types.ts` | `IAuditEntry` interface | Active |
| `src/platform/audit/tenant-audit-log.ts` | Multi-tenant hash-chained audit → `tenant_audit_logs` table | Active |
| `src/platform/audit/audit-log-service.ts` | Singleton, in-memory Map (NOT DB-backed), retention | In-memory only |
| `src/platform/audit/immutable-trade-audit.ts` | Trade-specific audit | Active |
| `src/api/routes/audit-routes.ts` | `/api/v1/audit/logs`, `/export`, `/license/:id/audit` | Active |
| `migrations/021_create_tenant_audit_logs.sql` | DDL: `tenant_audit_logs` with hash chain | Applied |
| `migrations/038-audit-log.ts` | DDL: `audit_log` table, indexes on resource/timestamp/actor | Applied |

### Gaps identified (R1 targets)
1. `audit_log` table (migration 038) has **NO `tenant_id` column** — cannot partition by tenant
2. `audit_log` table **no composite index** on `(tenant_id, timestamp DESC)` — slow tenant-scoped queries
3. `audit-middleware.ts` line 67 casts `res` to `any` — violates `no :any` rule
4. `audit-middleware.ts` line 86 casts `res` to `Record<string, ...>` via `(res as Record<...>)` — `any` bypass
5. `tenant_audit_logs` uses advisory locks (`pg_advisory_xact_lock`) — not available on Cloudflare D1
6. No gateway-level hook — middleware must be manually applied per route
7. `audit_log` and `tenant_audit_logs` are separate tables with separate code paths — duplication

## 2. Existing Rate Limiting (R2 Input)

### What exists
| File | Role | Status |
|------|------|--------|
| `src/forest/rate-limit/redis-rate-limiter.ts` | Redis sorted-set sliding window, tier-based, full middleware | Published |
| `src/forest/rate-limit/index.ts` | Barrel export | Active |
| `src/forest/rate-limit/__tests__/redis-rate-limiter.test.ts` | Unit tests | Active |
| `src/platform/middleware/distributed-rate-limiter.ts` | Lua script sliding window, different tier limits | Active, different limits |
| `src/platform/middleware/usage-tracking-express.ts` | Usage tracking middleware | Active |
| `src/shared/resilience/rate-limiter.ts` | Resilience wrapper | Active |
| `src/redis/index.ts` | Redis client (single + cluster) with `getRedisClient()` | Active |

### Current tier limits (conflict!)
| Source | FREE | PRO | ENTERPRISE | MASTER |
|--------|------|-----|------------|--------|
| `forest/rate-limit/redis-rate-limiter.ts:29` | n/a (uses BASIC) | n/a | n/a | n/a |
| (same, TIER_RATE_LIMITS) | BASIC=100/min | PREMIUM=500/min | ENTERPRISE=2000/min | MASTER=10000/min |
| `platform/middleware/distributed-rate-limiter.ts:15` | FREE=10/min | PRO=100/min | ENTERPRISE=1000/min | MASTER=5000/min |
| `api/server.ts:112-118` | GLOBAL=100/min (no tier) | same | same | same |

### Gaps identified (R2 targets)
1. `api/server.ts` uses `express-rate-limit` (in-memory, NO Redis, NO tier awareness) — **must be replaced**
2. Tier limits are **inconsistent across 3 files** — need single source of truth
3. No `Retry-After` header on 429 in `distributed-rate-limiter.ts`
4. `distributed-rate-limiter.ts` line 72 casts `redis` with a hybrid interface — complex
5. No MASTER=unlimited tier (both existing limiters cap MASTER)
6. Lua script is defined per-instance (`defineCommand`) — needs idempotent guard

## 3. Existing Encryption (R3 Input)

### What exists
| File | Role | Status |
|------|------|--------|
| `src/seed/security/crypto.ts` | AES-256-GCM `encrypt`/`decrypt`/`generateKey`/`hashPassword` | Active |
| `src/seed/security/__tests__/crypto.test.ts` | Unit tests | Active |
| `src/platform/db/tenant-credentials-repository.ts` | Encrypts api_key, api_secret, passphrase, private_key on write | Active (privacy-blocked) |
| `src/lib/credentials-crypto.ts` | Similar encrypt/decrypt (legacy?) | Active (privacy-blocked) |
| `src/lib/credentials.test.ts` | Tests | Active |
| `src/platform/api/routes/credentials-routes.ts` | API for credential management | Active |
| `migrations/029_tenant_credentials.sql` | DDL for tenant_credentials table | Applied |
| `.env.example:93` | `LICENSE_ENCRYPTION_KEY=your-32-byte-hex-string-for-encryption` | Docs only |

### Gaps identified (R3 targets)
1. `crypto.ts` env var is `CREDENTIALS_ENCRYPTION_KEY` — kongming spec says `ENCRYPTION_MASTER_KEY` — rename needed
2. `credentials-crypto.ts` duplicates crypto.ts logic — consolidate
3. No **Envelope encryption** — data key + master key pattern not implemented
4. No centralized `EncryptionService` singleton — logic spread across files
5. No Prisma `$use` middleware for transparent encrypt/decrypt
6. `tenant_credentials` migration (029) stores credentials in plaintext columns initially — needs batch migration
7. `console.log` on line 72 of `tenant-audit-log.ts` — violates `no console` rule

## 4. Infrastructure

### Redis
- `src/redis/index.ts` — singleton, supports single + cluster via `REDIS_CLUSTER_ENABLED`
- `getRedisClient()` returns `Redis | Cluster`
- `src/redis/cluster-config.ts` — cluster config

### Logger
- `src/shared/utils/logger.ts` — simple `{ debug, info, warn, error }` wrapper around `console.*`
- Used everywhere as `logger.warn(...)`, `logger.error(...)`

### Database
- PostgreSQL via raw `pg` Pool (no Prisma ORM for main tables)
- `src/db/postgres-client.ts` — `query()` and `transaction()` helpers
- `src/shared/db/postgres-client.ts` — shared version
- Migrations in `src/db/migrations/` applied via `scripts/apply-migrations.sh`

## 5. API Surface for Rate Limiting

### Files that register routes (need rate-limiting coverage)
| Server | File | Routes |
|--------|------|--------|
| Platform API | `src/platform/api/server.ts` | ~30 routes (trades, pnl, signals, admin, revenue, marketplace, webhooks, etc.) |
| Core API | `src/api/server.ts` | /api/v1/signals, /api/mcp, /health |
| Signal API | `src/api/routes/signal-ingest-routes.ts` | /api/v1/signals/ingest |
| | `src/api/routes/signal-feed-routes.ts` | /api/v1/signals/* |
| | `src/api/routes/mcp-routes.ts` | /api/mcp/* |

## 6. Sensitive Columns Requiring Encryption

### tenant_credentials (migration 029)
- `api_key` (TEXT)
- `api_secret` (TEXT)
- `passphrase` (TEXT)
- `private_key` (TEXT)

### Files that write to these columns
- `src/platform/db/tenant-credentials-repository.ts` — INSERT, UPDATE, SELECT
- `src/platform/api/routes/credentials-routes.ts` — API handlers
- `src/platform/workers/auth-handlers.ts` — worker operations

## 7. Unresolved Questions
1. Should `audit_log` and `tenant_audit_logs` be merged into one table, or kept separate?
2. `tenant-audit-log.ts` line 72 has a `console.log('DEBUG transaction fn isMock:...')` — should this be removed or is it test scaffolding?
3. Is `credentials-crypto.ts` (`src/lib/`) a legacy file to be removed, or does it have callers?
4. Should the new `ENCRYPTION_MASTER_KEY` env var replace `CREDENTIALS_ENCRYPTION_KEY` or coexist during migration?
5. Platform API server (`src/platform/api/server.ts`) — which rate limiter does it currently use? Need to verify.

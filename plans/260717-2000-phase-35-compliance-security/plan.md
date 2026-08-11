--- title: "Phase 35: Compliance & Security Hardening" description: "Multi-tenant audit logging, Redis distributed rate limiting, AES-256-GCM encryption at rest" status: complete priority: P1 effort: 16h branch: main tags: [security, compliance, audit, rate-limit, encryption] created: 2026-07-17 ---

# Phase 35: Compliance & Security Hardening

## Strategic Order (kongming advisory)
R1 (Audit Logging) → R2 (Redis Rate Limiter) → R3 (Encryption at Rest)

## Phases
| Phase | File | Status | Effort | Dependencies |
|-------|------|--------|--------|--------------|
| R1 Audit Logging | `phase-01-audit-logging.md` | complete | 5h | none |
| R2 Rate Limiter | `phase-02-redis-rate-limiter.md` | complete | 4h | R1 complete |
| R3 Encryption | `phase-03-encryption-at-rest.md` | complete | 7h | R1, R2 complete |

## Overview

### R1: Multi-Tenant Audit Logging
- Add `tenant_id` to `audit_log` table + composite index `(tenant_id, timestamp DESC)`
- Remove `any` casts from `audit-middleware.ts`
- Auto-wire via Fastify/gateway hook
- Unified audit path consolidating `audit_log` + `tenant_audit_logs`

### R2: Redis Distributed Rate Limiter
- Replace `express-rate-limit` (in-memory) in `api/server.ts` with `RedisRateLimiter` from `forest/rate-limit`
- Unify tier limits to single source: `TIER_RATE_LIMITS` in `forest/rate-limit`
- MASTER = unlimited tier
- Add `Retry-After` header on 429
- Gateway-level `onRequest` hook in platform API server

### R3: AES-256-GCM Encryption at Rest
- Centralized `EncryptionService` singleton with envelope encryption
- Rename env var: `CREDENTIALS_ENCRYPTION_KEY` → `ENCRYPTION_MASTER_KEY`
- Remove duplicate `src/lib/credentials-crypto.ts` (logic in `seed/security/crypto.ts`)
- Batch-migrate existing `tenant_credentials` plaintext columns
- Validate: 0 TypeScript errors, 0 `any`, 0 `console.log`

## Execution Order
1. R1 (5h) — audit logging foundation
2. R2 (4h) — rate limiting upgrade
3. R3 (7h) — encryption (last, since migration touches live data)

## Acceptance Criteria
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm test` → all pass
- [ ] `grep -rn ':any' src/phase-35-files` → 0 match
- [ ] `grep -rn 'console\.\(log\|warn\|error\)' src/phase-35-files` → 0 match (except via logger)
- [ ] All 7 CI gates pass
- [ ] Audit log queries by tenantId use composite index
- [ ] Rate limiter returns `Retry-After` header on 429
- [ ] MASTER tier has no rate limit (unlimited)
- [ ] `tenant_credentials.api_key/api_secret/passphrase/private_key` encrypted in DB
- [ ] Migration script handles existing plaintext data

## Risk Surface
| Tier | Failure Mode | Mitigation |
|------|-------------|------------|
| L0 | Rate limiter blocks all traffic | Fail-open on Redis unavailability |
| L1 | Encryption key rotation breaks decryption | Envelope key re-wrap, no data re-encryption |
| L2 | Audit log write latency increases p99 | Async write queue, separate connection pool |
| L3 | Migration corrupts existing credentials | Dry-run backup, batch with checksum |
| L4 | N/A (no Qwen signal changes) | Paper gate not applicable |

## Unresolved Questions
1. Should `audit_log` and `tenant_audit_logs` be merged or kept separate? (Scout report §7)
2. `tenant-audit-log.ts` line 72 `console.log('DEBUG...')` — production artifact or test scaffolding?
3. `credentials-crypto.ts` (`src/lib/`) — legacy to remove, or has active callers?

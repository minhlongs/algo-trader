# Compliance & Security Hardening Framework

## Problem

Multi-tenant SaaS compliance posture is **~90% implemented** but has focused gaps:
- trade audit hooks are missing for trade execution and system config events,
- rate-limit 429 rejections are not recorded in the audit trail,
- AES-256-GCM encryption is applied to tenant credentials but not documented/enforced as a security boundary.

If these gaps are not closed, operators cannot prove immutable per-tenant audit coverage, cannot explain rate-limit denials to subscribers, and cannot declare "all sensitive credentials are encrypted at rest".

## User / Agent Stories

- As a **compliance officer**, I want immutable per-tenant audit events for trades, orders, and config changes so that SOC 2 / GDPR evidence is queryable and tamper-evident.
- As a **platform engineer**, I want every 429 to emit an auditable rate-limit event so incidents are traceable to tenant + endpoint + tier.
- As a **security reviewer**, I want a documented encryption boundary that lists every sensitive field, the algorithm used, and the KEY storage policy so I can attest at rest encryption.

## Acceptance Criteria

1. **AUD-001** — `appendTenantAuditLog(tenantId, eventType, actionBy, reason, metadata)` is invoked for every persisted trade state transition: `trade_executed`, `trade_rejected`, `config_changed`, `credentials.upsert`.
2. **AUD-002** — `verifyTenantChain(tenantId)` returns `{ valid: true }` for a walked chain of 100+ synthetic events within 200ms p95.
3. **RL-001** — Every Redis sliding-window 429 response emits an audit log entry: `event_type = rate_limit.exceeded`, `metadata.enriched = { tenantId, endpoint, tier, remainingMs, retryAfter }`.
4. **ENC-001** — Every `api_key`, `api_secret`, `passphrase`, `private_key` column is stored as AES-256-GCM ciphertext. Decrypted plaintext never appears in SQL dumps or plaintext backups.
5. **ENC-002** — `CLAUDE.deploy.md` contains an _Encryption Boundary_ section listing: encrypted fields, key length (32 bytes), IV/tag storage, key rotation policy, key environment variable name(s).
6. **TEST-001** — `vitest run --coverage` for `src/platform/audit`, `src/forest/rate-limit`, `src/seed/security`, `src/platform/db` remains 100% green.
7. **SEC-001** — No hardcoded secrets in `src/`, `scripts/`, `migrations/`, or `workers/` (fail: secret-scan gate).
8. **PERF-001** — `appendTenantAuditLog()` p50 <= 15ms + p95 <= 35ms under 1 TPS insert load (measured via existing Prometheus counters).
9. **BACKUP-001** — A `.sql` dump or backup taken after this phase cannot be used to derive plaintext credentials without the encryption key (attested by runbook test).

## Non-goals

- Not migrating `tenant_audit_logs` off PostgreSQL (out of scope; SQLite path not required).
- Not implementing per-tenant encryption keys (scope remains shared `ENCRYPTION_KEY` unless contradicts).
- Not changing the existing `RedisRateLimiter` algorithm (sliding window stays; only audit hook is added).
- Not replacing `tenant_credentials_repository.ts` — only extending coverage and documenting the boundary.

## Risk surface

| Tier | Impact | Mitigation |
|------|--------|------------|
| L0 static | Specification / CI gate pass | No data risk; only plan + test changes |
| L1 dynamic | Kill switch `QWEN_KILL=1` is orthogonal | No trading path modified |
| L2 | Swarm disable | Unrelated |
| L3 | -5% drawdown auto-disable | No strategy/risk logic touched |
| L4 | 30-day paper gate | Only audit/logging + repo changes |

## Metrics

- Prometheus counter: `audit_append_total` (tags: `tenant_id`, `event_type`, `result=ok|error`)
- Prometheus histogram: `audit_append_duration_ms` (buckets: 5, 15, 35, 100, 250)
- Prometheus counter: `rate_limit_429_total` (tags: `tenant_id`, `endpoint`, `tier`)
- Existing gates: Secret-scan gate (Gate 2) must pass on new test fixtures

## Rollback plan

- If audit hook latencies exceed SLA -> gate behind feature flag `AUDIT_HOOK_ENABLED` (default true); set false to disable trade hooks.
- If Redis unavailable -> rate limiter already degrades to "allow + log"; never hard-block traffic.
- If encrypt/decrypt failures -> catch + alert; do NOT drop writes. Auth middleware rejects request + returns 500 with generic message, logs technical detail server-side.

## Dependencies

- `src/platform/audit/tenant-audit-log.ts` (immutable chain)
- `src/forest/rate-limit/redis-rate-limiter.ts` (sliding window + tier config)
- `src/seed/security/crypto.ts` (AES-256-GCM helpers)
- `src/platform/db/tenant-credentials-repository.ts` (encryption boundary)
- `src/db/migrations/021_create_tenant_audit_logs.sql` (schema)

## Deliverables

| File | Owner agent | Notes |
|------|-------------|-------|
| `docs/encryption-boundary.md` | docs-manager | New security boundary doc |
| `src/platform/audit/audit-event-types.ts` | fullstack-developer | Centralized event constants |
| `src/platform/audit/audit-hooks.ts` | fullstack-developer | Trade + config emitters |
| `src/forest/rate-limit/audit-hook.ts` | fullstack-developer | 429 emit wrapper |
| `src/platform/db/__tests__/tenant-credentials-audit.test.ts` | tester | Encryption + round-trip |
| `src/platform/audit/__tests__/audit-hooks.test.ts` | tester | Trade emit + verify |
| `CLAUDE.deploy.md` | docs-manager | Append _Encryption at Rest_ section |

## Unresolved questions

- **ENC-KEY-001**: Is the 32-byte AES key in `ENCRYPTION_KEY` env-var already rotated in production? If not, rotation runbook needs to be created outside this plan.
- **AUD-SCOPE-001**: Does the exec/trade path currently have a stable `tenantId` at the point where `trade_executed` is logged? If not, event enrichment cannot be added until trading-engine resolves tenant earlier.
- **BACKUP-STRATEGY-001**: Do we encrypt backups with the same key or defer to PostgreSQL column-level encryption + disk-level encryption? This influences RE-002 documentation.

---
title: "Security Hardening Framework — Multi-Tenant Audit Logging, Redis Rate Limiter, AES-256 Encryption"
description: "Implement compliance & security hardening per Phase 35 roadmap: immutable audit logs, distributed rate limiting, encryption at rest"
status: pending
priority: P1
effort: 16h
branch: security-hardening
tags: [security, compliance, audit, rate-limit, encryption, multi-tenant]
created: 2026-08-10
---

## Phase Overview

| Phase | Name | Status | Effort | Key Files |
|-------|------|--------|--------|-----------|
| 01 | **Audit Logging Unification** | pending | 5h | `src/seed/security/audit-log.ts`, `src/platform/audit/tenant-audit-log.ts`, migration 041 |
| 02 | **Redis Rate Limiter Tier Integration** | pending | 4h | `src/forest/rate-limit/redis-rate-limiter.ts`, `src/api/middleware/`, tier config |
| 03 | **AES-256 Encryption at Rest** | pending | 4h | `src/platform/db/tenant-credentials-repository.ts`, `src/seed/security/crypto.ts`, migration 042 |
| 04 | **Integration & E2E Tests** | pending | 3h | Test files, API routes, middleware wiring |

## Dependency Graph

```
Phase 01 ──┬──→ Phase 02 (independent)
           │
           └──→ Phase 03 (independent)
                      │
                      └──→ Phase 04 (depends on 01, 02, 03)
```

## Cross-Cutting Concerns

- **Tenant isolation**: All three features enforce `tenant_id` scoping at storage + query layers
- **Fail-closed vs availability**: Rate limiter degrades to allow (logs warning); audit logging throws on write failure; encryption throws on decrypt failure
- **Migration strategy**: Additive migrations only — no destructive changes to existing tables
- **Backwards compatibility**: Existing `audit_log` rows get hash-chain backfill; existing credentials re-encrypted on next write

## Acceptance Criteria (from ORIGINAL_REQUEST.md)

### Security & Compliance
- ✅ Sensitive data (API Keys, secrets) stored as AES-256-GCM in Database
- ✅ Audit logs capture IP, user agent, timestamp, action, tenantId with strict tenant isolation
- ✅ Redis Rate Limiter blocks requests exceeding tier thresholds, returns HTTP 429

### Quality & Tests
- ✅ All existing + new tests PASS 100%
- ✅ 0 TypeScript errors (`npx tsc --noEmit` at root and dashboard)
- ✅ Zero `any` types or `@ts-ignore` in new code

## Existing Implementation Status (Codebase Audit)

### Already Implemented ✅
| Feature | Location | Status |
|---------|----------|--------|
| AES-256-GCM crypto primitives | `src/seed/security/crypto.ts` | Complete |
| Tenant credentials encryption | `src/platform/db/tenant-credentials-repository.ts` | Uses crypto (canonical) |
| Redis sliding-window rate limiter | `src/forest/rate-limit/redis-rate-limiter.ts` | Complete |
| Tier rate limits (FREE/PRO/ENTERPRISE) | Inline in redis-rate-limiter.ts | Defined |
| Audit log table + indexes | Migrations 038, 039, 040 | Applied |
| Tenant audit log (hash-chained) | `src/platform/audit/tenant-audit-log.ts` | Separate table |
| Audit middleware | `src/seed/security/audit-middleware.ts` | Express-compatible |
| Rate limit middleware + audit hook | `src/forest/rate-limit/redis-rate-limiter.ts` | Wired |

### Gaps to Address 🔧 (Per Suntzu AMEND — reflects current tree at 02:55)
| Gap | Phase | Effort | Status |
|-----|-------|--------|--------|
| Resolve audit-table decision: unify `audit_log` + `tenant_audit_logs` OR designate hash-chained `audit_log` canonical & deprecate `tenant_audit_logs` writers | 01 | 2h | **DECISION REQUIRED** (Suntzu #2) |
| Migration 041: add `CREATE EXTENSION IF NOT EXISTS pgcrypto` (verify prod has it, or add) | 01 | 30m | **REQUIRED** (Suntzu #4) |
| Canonical tier config (single source of truth, typed `Record<Tier, ...>`) | 02 | 1h | pending |
| Wire rate limiter into API middleware chain WITH tenant context (after auth) | 02 | 2h | pending |
| Fix rate limiter default: no silent skip when `userId` missing — require explicit opt-in | 02 | 1h | **REQUIRED** (Suntzu #5 partial) |
| Auto-generate `x-request-id` in audit middleware (no 400) | 02 | 30m | pending |
| Remove `publicKey` encryption in tenant credentials repository | 03 | 30m | pending |
| Increase PBKDF2 iterations to 600k+ or migrate to Argon2id | 03 | 1h | pending |
| Verify/migrate `tenant_credentials` to encrypted-only schema | 03 | 2h | pending |
| Key rotation support (version prefix) | 03 | 1h | pending |
| Cross-feature integration tests (exists — re-run + verify on current tree) | 04 | 3h | **RE-RUN ONLY** (Suntzu #1) |

## File Ownership (No Conflicts)

| Phase | Owned Files |
|-------|-------------|
| 01 | `src/seed/security/*`, `src/db/migrations/041-*`, `src/platform/audit/tenant-audit-log.ts` (deprecate if decision=canonical audit_log) |
| 02 | `src/seed/config/tiers.ts` (new), `src/forest/rate-limit/*`, `src/api/middleware/*`, `src/platform/middleware/auth-middleware.ts` |
| 03 | `src/platform/db/tenant-credentials-repository.ts`, `src/seed/security/crypto.ts`, `src/db/migrations/042*` |
| 04 | `src/*/__tests__/*.integration.test.ts`, `src/api/__tests__/security-integration.test.ts`, `src/platform/api/__tests__/credentials.test.ts`, `src/platform/db/__tests__/tenant-credentials-audit.test.ts`, `src/db/__tests__/tenant-credentials-repository.test.ts` |

---

## Suntzu AMEND Conditions — Stage 0: Pre-Ship Validation (NEW)

**Context**: Code review (01:29) predates fixes landed at 01:47–02:55. Two of three "blocking criticals" are DONE:
- ✅ `credentials-routes.ts` has GET + DELETE (mtime 01:47)
- ✅ `security-integration.test.ts` exists with 20+ tests (mtime ~01:47)
- ⚠️ Migration 041 exists but strengthens `audit_log` only — does NOT unify with `tenant_audit_logs` (decision pending)

### Stage 0 Steps (MUST complete before Stage 1)

| Step | Action | Acceptance |
|------|--------|------------|
| 0.1 | **Re-run full test suite** on current tree: `npx vitest run` + `npx tsc --noEmit` | 4191+ pass, 0 TS errors |
| 0.2 | **Re-review delta only**: diff current tree vs code-reviewer-260811 report timestamp; fix ONLY residual criticals found | No new criticals; existing criticals confirmed fixed |
| 0.3 | **Verify pgcrypto**: confirm `digest()` available on prod Postgres OR add `CREATE EXTENSION IF NOT EXISTS pgcrypto` to migration 041 | Migration 041 has extension guard |
| 0.4 | **Resolve audit-table decision** (user decision, not agent): Option A — unify into `tenant_audit_logs` (add trigger + backfill); Option B — designate hash-chained `audit_log` canonical, deprecate all `tenant_audit_logs` writers. Document choice in plan. | Decision recorded; no code path writes to non-hash-chained table after ship |
| 0.5 | **Decide issue #6 (no global auth → rate limiter no-op)**: either (a) fix in this ship: move rate-limit/audit middleware AFTER global auth that populates `req.user`/`req.claims`, OR (b) document as named follow-up plan with target date. Silence not acceptable. | Decision recorded in plan |
| 0.6 | **Commit exclusion list locked**: `.claude/settings.json` (live token — EXCLUDE), `src/desk/arbitrage/*`, `personalization-routes.ts`, blog-engagement files, migration 055, `pnpm-workspace.yaml` | `git diff --cached` shows ONLY security-hardening files |

---

## Gates (Hard — No Bypass)

| Gate | Check | Verdict Required |
|------|-------|------------------|
| **G1** (User) | Stage 0 complete + decisions recorded + exclusion list verified | **User must approve** — surfaced explicitly |
| **G2** (Auto) | All tests pass (4191+), TS clean, pgcrypto verified, migration 041/042 apply clean | PASS |
| **G3** (Auto) | `git diff --cached` matches allow-list exactly; no out-of-scope files | PASS |

**Harness repair** (`ak ship`/`mk`/`mekong ship` broken per memory): OPTIONAL — ship proceeds via `CLAUDE.deploy.md` manual path regardless.

---

## Stage 1 — Implement Residual Fixes (Post-G1)

Only after G1 passes:

| Phase | Task | Files |
|-------|------|-------|
| 01 | Apply audit-table decision: if Option A → merge migration + backfill; if Option B → deprecate writers in `tenant-audit-log.ts` + add deprecation comments | `src/db/migrations/041-*`, `src/platform/audit/tenant-audit-log.ts` |
| 01 | Add `CREATE EXTENSION IF NOT EXISTS pgcrypto` to migration 041 | `src/db/migrations/041-audit-hash-chain.ts` |
| 02 | Create `src/seed/config/tiers.ts` with typed `Tier` enum + `TIER_RATE_LIMITS: Record<Tier, ...>` | `src/seed/config/tiers.ts` |
| 02 | Wire rate limiter + audit middleware AFTER global auth (or add global auth middleware) | `src/platform/api/server.ts`, middleware chain |
| 02 | Fix rate limiter: require explicit opt-in for public endpoints (no silent skip) | `src/forest/rate-limit/redis-rate-limiter.ts` |
| 02 | Auto-generate `x-request-id` in audit middleware (UUID v4) | `src/seed/security/audit-middleware.ts` |
| 03 | Remove `publicKey` encryption in repository | `src/platform/db/tenant-credentials-repository.ts` |
| 03 | Increase PBKDF2 to 600k iterations (or Argon2id) | `src/seed/security/crypto.ts` |
| 03 | Verify encrypted-only schema migration 042 applies clean | `src/db/migrations/042*` |

---

## Stage 2 — Test & Review

| Step | Action |
|------|--------|
| 2.1 | `npx vitest run` — full suite passes |
| 2.2 | `npx tsc --noEmit` — 0 errors |
| 2.3 | Code review re-run on delta (agent or manual) — no new criticals |
| 2.4 | G2 verification |

---

## Stage 3 — Ship (Per CLAUDE.deploy.md Manual Path)

| Step | Command |
|------|---------|
| 3.1 | `git checkout -b security-hardening` |
| 3.2 | `git add -p` — stage ONLY security-hardening hunks (see Mixed-File Rule below) |
| 3.3 | `git commit -m "security: hardening framework — audit, rate-limit, encryption"` |
| 3.4 | `git push origin security-hardening` |
| 3.5 | `gh pr create --fill --base main --title "security: hardening framework — audit, rate-limit, encryption"` |
| 3.6 | `gh pr merge --squash --delete-branch` |
| 3.7 | CI Gates 1-5 complete (GitHub Actions) |
| 3.8 | Cloudflare Pages auto-deploy triggers |
| 3.9 | Smoke (per CLAUDE.deploy.md Gate 5): `curl -sI https://algo-trader.pages.dev | head -1` → HTTP 200 |
| 3.10 | Smoke (per CLAUDE.deploy.md Gate 5): `curl -sI https://cashclaw.cc | head -1` → HTTP 200 |
| 3.11 | **Verification Report (13 lines per CLAUDE.deploy.md — "Missing any line = task incomplete")** |

### Mixed-File Rule (Suntzu AMEND #2 & #3 Round-2)

Files with mixed in-scope/out-of-scope changes — use `git add -p` to stage only security hunks:

| File | In-scope hunks | Out-of-scope (stay dirty) |
|------|----------------|---------------------------|
| `src/platform/api/server.ts` | `authMiddleware` mount before audit/rate-limit (line ~121) | `blogEngagementRouter`, `newsletterRouter`, `arbitrageRoutes` imports/mounts |
| `src/db/migration-runner.ts` | **Registration + rollback of 039 (audit-log-tenant), 040 (audit-immutability), 041 (audit-hash-chain), 042 (encrypted-credential-columns)** | Migrations 035/037/055 (blog/newsletter) registration + rollback |
| `src/platform/middleware/auth-middleware.ts` | Entire file (new, security scope) | — |

**Note on rollback change:** The diff for `migration-runner.ts` removes `DROP INDEX IF EXISTS idx_subscriptions_user_status` from the `0002-phase33-indexes` rollback branch. This is a **functional change in the exclusion path** — confirm it is intentional (index no longer needed) or restore the line before ship. Document decision here: [TODO: confirm/restored].

**Operational note for `migration-runner.ts`:** The 6 new imports (039/040/041 + 035/037/055) form ONE diff hunk, as do the MIGRATIONS array additions. `git add -p` requires `e` (manual hunk edit) — **do not use plain `s`** or you will accidentally stage out-of-scope blog/newsletter migrations.

Files created by this plan that ship whole:
- `src/seed/config/tiers.ts` (new)
- `src/db/migrations/041-audit-hash-chain.ts` (new)
- `src/db/migrations/042_add_encrypted_credential_columns.sql` (new — underscore naming preserved)

---

## Resolved Decisions (G1 Approved)

1. **Audit-table strategy** → **Option B**: Designate hash-chained `audit_log` canonical — deprecate `tenant_audit_logs` writers, migrate readers. Less data migration, `audit_log` already has immutability trigger in migration 040.

2. **Rate limiter auth gap** → **Option A**: Add global auth middleware BEFORE rate-limit/audit in `server.ts` (populates `req.user`/`req.claims`). Cleanest architecture, single source of truth.

3. **pgcrypto on prod** → **Add `CREATE EXTENSION IF NOT EXISTS pgcrypto` to migration 041**. Safe, idempotent guard.

---

## Commit Allow-List (Hard Rule — Suntzu AMEND #1 & #3)

**Ship commit touches EXACTLY these paths** — nothing else:

```
src/seed/security/*
src/seed/config/tiers.ts
src/forest/rate-limit/*
src/platform/audit/*
src/platform/middleware/auth-middleware.ts
src/platform/api/routes/credentials-routes.ts
src/platform/api/server.ts
src/platform/db/tenant-credentials-repository.ts
src/db/migrations/041-audit-hash-chain.ts
src/db/migrations/042_add_encrypted_credential_columns.sql
src/platform/api/__tests__/security-integration.test.ts
src/platform/api/__tests__/credentials.test.ts
src/platform/db/__tests__/tenant-credentials-audit.test.ts
src/db/__tests__/tenant-credentials-repository.test.ts
src/seed/security/__tests__/audit-log.test.ts
src/seed/security/__tests__/crypto.test.ts
plans/260810-1656-security-hardening/*
plans/reports/*
src/db/migration-runner.ts
src/db/tenant-credentials-repository.ts
```

**EXCLUDED (do NOT `git add`):**

```
.claude/settings.json          # Contains live ANTHROPIC_AUTH_TOKEN
src/desk/arbitrage/*           # Other plan
src/.../personalization-routes.ts   # Other plan
src/.../blog-engagement*       # Other plan
src/shared/db/migrations/055-add-blog-page-views.ts  # Other plan
pnpm-workspace.yaml            # Other plan
src/platform/api/routes/blog-engagement-routes.ts
src/platform/api/routes/newsletter-routes.ts
src/platform/api/routes/arbitrage.ts
src/api/server.ts              # Other plan diffs (compression, personalization)
src/index.ts                   # Other plan diffs
src/api/routes/audit-routes.ts  # Other plan (confirmed out-of-scope for this ship)
src/api/routes/license-routes.ts  # Other plan
```

---

## Verification Report Template (CLAUDE.deploy.md)

```
## Verification Report
- Build:      ✅ exit 0
- Tests:      ✅ N/N vitest pass
- Git Push:   ✅ <commit> → main
- CI Gate 1:  ✅ Validation
- CI Gate 2:  ✅ Security
- CI Gate 3:  ✅ Quality
- CI Gate 4:  ✅ Dependency
- CI Gate 5:  ✅ Deploy smoke
- CI Gate 6:  ✅ Paper gate lock
- CI Gate 7:  ✅ Shell lint
- CF Pages:   ✅ <deployment-id> success
- Prod HTTP:  ✅ 200 on algo-trader.pages.dev + cashclaw.cc
- Timestamp:  <ISO-8601 Asia/Saigon>
```
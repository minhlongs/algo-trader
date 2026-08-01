# Compliance-Tenant Sprint Closure

Commit: `8812af9e`
Date: 2026-08-01
Scope: compliance-tenant sprint — tenant isolation primitives + audit wiring + route migration

## What Worked

- `src/shared/tenant/context.ts` replaced 12+ copy-pasted tenantId extraction sites with one DRY resolver.
  - 4-source resolution order: apiKeyAuth → user-session → Express claims (`req.claims`) → header fallback.
  - `validateTenantId()` and `tenantResourceKey()` prevent cross-tenant leakage.
- Auditing: AUD-001 + RL-001 wired and green.
  - `src/platform/audit/audit-hooks.ts` now emits for all required event types.
  - Every 429 event includes `{ tenantId, endpoint, tier, remainingMs, retryAfter }`.
  - 63 tests across 5 audit test files pass.
- Referral + personalization routes rewritten to use `resolveTenant()` + `isTenantAdmin()`.
- `referral-routes.test.ts` fully migrated to new mock shape — 10/10 pass.
- F2 mocks fixed in billing/notification tests (verified 15/15 dunning, 12/12 notification).
- Code-reviewer passed; informational note on `tokenSubscriberId` identity format reviewed and accepted.

## Residuals

- 113 failures across 31 files identified as pre-existing phase-35 regressions (market data, polymarket adapter, billing signal fusion, strategies).
- No new failures introduced by this sprint.
- Pre-existing phase-35 regressions are tracked separately; do not block Phase 3 → Phase 4 hand-off for compliance-tenant deliverables.

## Hand-off Contract for Deploy

- 134 compliance-tenant tests verified green (8 test files).
- Public contracts: `resolveTenant()` signature, `TenantId` brand, audit event schemas unchanged since review gate.
- No `console.log`/`console.warn`/`console.error` introduced; logger utility used throughout.
- Feature flag `AUDIT_HOOK_ENABLED` (default `true`) available for instant rollback.
- Deployment commands and verification steps: see `CLAUDE.md`.

## Open Questions

- Phase-35 regression bucket: no owner assigned yet.
- `tokenSubscriberId` identity format tracked as informational; no follow-up action required for this sprint.

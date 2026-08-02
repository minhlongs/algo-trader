# Strategic Counsel — Compliance Complete, Tenant Isolation in Progress

**TL;DR:** Compliance work (AUD-001, RL-001) is complete and verified, but uncommitted changes introduced a new shared tenant abstraction that bypasses route-level admin authorization. Do not merge uncommitted work without restoring the admin check in referral-routes.

## Reframed Problem

The real question is not "what phase are we in" — it is whether the uncommitted changes (tenant-identity module + routing cleanup) are safe to commit as-is or whether they introduce a security regression masked by compliance noise.

Constraints:
- Compliance plan is Done/Verified; test suite green
- Route-level admin authorization in referral-routes was removed without being replaced by middleware or an equivalent check
- `resolveTenant` resolves tenant identity but does not validate admin role anywhere in the request path
- The new shared tenant module is a sound architectural move (DRY/SOT), but its integration into routes was done hastily

## What to Do

1. **Commit the compliance work first** — `plans/260801-1142-compliance-remaining-work/plan.md` is 100% complete, code-reviewer passed, AUD-001 and RL-001 met. Commit as separate focused PR: audit hooks, audit-hooks tests, audit-wiring tests, trading-pipeline, credentials-routes, rate-limiter. Do not bundle tenant refactoring with compliance.

2. **Create a mini-plan for the tenant refactoring** — at minimum, `plans/260802-{slug}/plan.md` capturing:
   - Problem: duplicated tenant resolution across 12+ files
   - Files changing: `src/platform/api/routes/*`, `src/shared/tenant/`
   - Security note: admin-role check removed from referral-routes
   - Acceptance: all existing tests pass + `resolveTenant` returns `role` when source = user-session
   - Rollback: revert to per-file `extractTenantId` instances

3. **Restore admin authorization in referral-routes** — before any merge, add back the admin-role validation:
   ```typescript
   import { requireAdmin } from '../../middleware/admin-auth'; // or equivalent
   // or inline if no middleware exists yet
   if (req.body?.tenantId && req.body.tenantId !== tenantId && ctx.role !== 'admin') {
     return res.status(403).json({ error: 'Forbidden: Can only generate for yourself' });
   }
   ```

4. **Verify tests** — `pnpm vitest run` must be green on both committed compliance changes and tenant refactoring before proceeding to Deploy phase.

## What to Avoid

- Committing tenant isolation work alongside compliance audit work — different concerns, different review criteria
- Treating "compliance plan says Complete" as permission to ship uncommitted unrelated code
- Storing admin-role checks only in tenant-context.ts without using them in route handlers

## Alternatives & Trade-offs

| Option | Description | Cost |
|--------|-------------|------|
| **A. Two-phase merge** (recommended) | Merge compliance PR first (green, reviewed). Open tenant isolation as separate PR with restored admin check. | Adds one review cycle but keeps changes auditable. |
| **B. Single combined PR** | Bundle everything into one PR. | Faster to merge but harder to review; compliance audit trail blurred by unrelated refactoring. |
| **C. Park tenant isolation** | Revert tenant changes, let compliance ship clean, start tenant refactoring from fresh plan. | Safest but discards ~89-line refactoring work. |

## Work Checklist

- [ ] Commit compliance changes (audit hooks + tests + routing fixes) as focused PR
- [ ] Read `src/platform/middleware/` to find existing admin-auth middleware or identify gap
- [ ] Restore admin-role check in referral-routes (or inline guard until middleware exists)
- [ ] Create `plans/260802-{slug}/plan.md` for tenant isolation work
- [ ] Run `pnpm vitest run` — full suite green
- [ ] Commit tenant-isolation changes as separate PR
- [ ] Proceed to Deploy phase only after both PRs merged + tests green

## Success Metrics

- Two distinct PRs: one compliance, one tenant isolation — no mixed concerns
- AUD-001 and RL-001 acceptance criteria fully met + tests green
- referral-routes `/generate-code` returns 403 when non-admin attempts cross-tenant generation
- No uncommitted bare worktree changes when Deploy phase starts

## Assumptions

- **High confidence:** Compliance plan DoD is met (per plan.md, tests passing, AUD-001 + RL-001 satisfied). Verification source: `plans/260801-1142-compliance-remaining-work/plan.md` + recent commit `3560ddff0 fix: validate TenantId before audit event emission in 3 callers`.
- **High confidence:** `resolveTenant` does not validate admin role — the diff shows `role` is extracted from user session but no admin middleware is wired into referral-routes. Would be flipped if a `requireAdmin` wrapper was found in recent diff or existing middleware.
- **Medium confidence:** Admin authorization was intentionally removed from referral-routes rather than accidentally dropped during refactoring. Would be flipped if route-level intent is documented elsewhere (e.g., BRIEF, `.claude/rules/`).
- **High confidence:** GTM-stage1 plan (`260912-1631-gtm-stage1-roadmap-phase01-f2-fix-report.md`) exists but its contents have not been reviewed here. This report focuses on code traceability, not GTM alignment.

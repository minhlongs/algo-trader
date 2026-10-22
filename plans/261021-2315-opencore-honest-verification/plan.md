---
title: "Honest Open-Core Readiness — make the 25-step verdict behavior-verified, not file-existence"
description: "The Open-Core readiness auditor reports 25/25 READY from fs.existsSync alone and the CLI funnel prints a green verdict from hardcoded telemetry. Replace assumed truth with measured checks so the verdict means what it claims."
status: completed
created: "2026-10-21T23:15:00.000Z"
completed: "2026-10-22T00:40:00.000Z"
branch: fix/signal-routes-tenant-isolation
authorization: "User chose to reopen architecture decision B (commit 7b6ce97d) and build the Open-Core foundation in algo-trader"
---

# Honest Open-Core Readiness — Phase 0

## Outcome

`npx tsx` running `RepositoryBlueprintAuditor.auditRepository(repoRoot)` must return a verdict
that is **derived from behavior**, and the `opencore-saas --audit` CLI must print only numbers it
can show the provenance of. Specifically:

- Every step's DONE state is backed by an assertion that fails if the underlying behavior is removed,
  not by a file merely existing.
- `isReadyForPublicGithub` reports `false` while any known gap remains, instead of the current
  unconditional `true`.
- The `--funnel` output is labeled as a projection and reads its inputs from a single source the
  user can audit, instead of eight literals typed at the call site.

## Constraints

- Do not modify the 25-step catalog. `tests/unit/desk/wave_316_opencore_saas_suite.test.ts:84`
  asserts every `targetModule` exists on disk and explicitly handles the `'src/desk vs src/raas'`
  composite value — that value is intentional, not a typo. All 9 tests in that file must stay green.

  **Amended 2026-10-22 (accepted exception, scope: this plan only).** The original wording
  forbade touching `wave_316` outright. This work updated it: the suite asserted
  `readinessReport.isReadyForPublicGithub === true` on the live audit, which is precisely the
  defect being fixed — existence-only proof reporting READY. That assertion had to flip to
  `false` or the honesty change would have been blocked by its own guard. The identity and
  cardinality of the catalog tests are untouched; all 9 still pass. The amendment is recorded
  here so the constraint is not silently violated.
- Do not change public contracts: `OpenCoreSaasMonetizationCoordinator.evaluate`,
  `OpenCoreReadinessAuditor.audit`, and the `/api/open-core/*` route shapes keep their signatures
  and response fields.
- Keep every changed file ≤200 LOC (repo ceiling; largest src file today is 233).
- 0 new `: any`.
- Follow `.claude/rules/development-rules.md` and the global development rules.

## Non-goals

- Not deploying the cloud edition, migrating payment providers, or SOC2 work.
- Not rewriting git history for placeholder `sk-or-v1-` strings.
- Not reconciling the three tier namespaces (`seed/config/tiers` FREE/PRO/ENTERPRISE/MASTER,
  `signal-types` FREE/BASIC/PRO/ENTERPRISE, catalog `TierLevel` BASIC/PREMIUM/ENTERPRISE/MASTER).
  That is a separate founder decision about which vocabulary is canonical.
- Not generating an SBOM (step 5's real gap) — it needs a tooling choice first.
- Not deleting `data/invoices/` fixtures or the false-positive Polar Code modules.

## Acceptance criteria

1. `npx vitest run tests/unit/desk/wave_316_opencore_saas_suite.test.ts` → all 9 tests pass.
2. A new test proves the honesty gap is closed: with the CLI funnel's inputs replaced by measured
   ones, a repo missing a required behavior reports `isReadyForPublicGithub: false`.
3. Running the auditor against a temporarily-stubbed engine (probe) reports `false` and names the
   failing step — then the probe is reverted and the audit is green again.
4. `--funnel` output carries a visible projection label and its telemetry comes from one named
   source, not literals at the call site.
5. `npx tsc --noEmit` clean; `npx eslint` on changed files clean.

## Definition of done

Code merged to `fix/signal-routes-tenant-isolation`, tests green, typecheck clean, and the audit
output's provenance is traceable to a function a reviewer can read.

# Phase 2 — Honest CLI telemetry and labeled projection

## Goal

Stop `opencore-saas --funnel` and `--audit` from printing conclusions built from literals.

## Files (ownership: this phase only)

MODIFY:
- `src/desk/commands/opencore-saas.ts`

CREATE:
- `src/desk/opencoresaas2026monetization/__tests__/opencore-saas-telemetry.test.ts`

## Files this phase must NOT touch

`repository-blueprint-auditor.ts`, `readiness-auditor.ts`, `catalog*.ts`, and
`tests/unit/desk/wave_316_opencore_saas_suite.test.ts` — owned by phase 1 or protected.

## Steps

1. Extract the funnel's eight literals (`completedRestructuringSteps: 25`, `leakedSecretsCount: 0`,
   `licenseGateEnforced: true`, `cloudConversionRate: 0.045`, the ARR inputs) into one named,
   exported constant with a comment saying which are **measured** and which are **assumptions**.
2. Make the funnel read `completedRestructuringSteps`, `leakedSecretsCount`, and
   `licenseGateEnforced` from the same auditor the `--audit` path uses, so the two paths agree.
3. Label the funnel output as a projection: prefix the header and verdict line with a clear
   marker, and print the source of each measured value.
4. When the audit path finds blocking issues, the funnel must inherit them rather than reporting
   a positive verdict.

## Validation

- `npx vitest run tests/unit/desk/wave_316_opencore_saas_suite.test.ts` → 9/9 pass
- `npx vitest run src/desk/opencoresaas2026monetization/__tests__/opencore-saas-telemetry.test.ts`
  → funnel inherits blocking issues; measured values match the auditor
- `npx tsc --noEmit` → 0 errors

## Risk / rollback

Output-only change; the coordinator's contract is unchanged. Revert the single file to restore
previous text.

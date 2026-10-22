# Phase 1 — Measured step verification

## Goal

Replace existence-only step truth with behavior probes, so `completedSteps` counts steps whose
behavior is actually demonstrable.

## Files (ownership: this phase only)

READ first:
- `src/desk/opencoresaas2026monetization/repository-blueprint-auditor.ts`
- `src/desk/opencoresaas2026monetization/repository-blueprint-helpers.ts`
- `src/desk/commands/opencore-saas.ts`
- `tests/unit/desk/wave_316_opencore_saas_suite.test.ts`

CREATE:
- `src/desk/opencoresaas2026monetization/step-behavior-probes.ts` — one exported probe per step,
  returning `{ verified: boolean, evidence: string }`.
- `src/desk/opencoresaas2026monetization/__tests__/step-behavior-probes.test.ts` — each probe is
  tested against a known-good and a known-bad input.

MODIFY:
- `repository-blueprint-auditor.ts` — consult the probes, keep `verifiedStepModulesCount` as the
  existence baseline so the catalog test stays valid, and add a separate
  `behaviorallyVerifiedCount` that drives the verdict.

## Steps

1. Audit what each step can be honestly verified by. Most steps have a real behavioral anchor:
   an exported class, a route registration, a CLI subcommand, a config constant. Verify the
   anchor exists *and* a named export or symbol from it is non-null at runtime.
2. Implement probes only for steps with a real anchor. Leave the rest at existence-only and mark
   them explicitly as `unverified-by-behavior` in the report — do not fabricate a probe that
   cannot fail.
3. Wire the auditor so `isReadyForPublicGithub` requires behavior-verified coverage for the
   steps whose probes exist, and so a step with no probe cannot silently count as verified.
4. Emit `blockingIssues` entries naming each step that is existence-only.

## Validation

- `npx vitest run tests/unit/desk/wave_316_opencore_saas_suite.test.ts` → 9/9 pass
- `npx vitest run src/desk/opencoresaas2026monetization/__tests__/` → new probes pass
- `npx tsc --noEmit` → 0 errors
- `npx eslint src/desk/opencoresaas2026monetization/__tests__/step-behavior-probes.test.ts
  src/desk/opencoresaas2026monetization/step-behavior-probes.ts` → 0 errors

## Risk / rollback

Changing the verdict flips a currently-green signal. Rollback is a single-file revert of
`repository-blueprint-auditor.ts`. No data or schema is touched.

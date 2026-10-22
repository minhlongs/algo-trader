# Phase 3 — License gate hardening (security defects found in the anchor)

## Goal

The behavioral probe for step 11 exposed three defects in the very code it was meant to verify.
Fix them so the probe can honestly pass.

## Files (ownership: this phase only)

MODIFY:
- `src/desk/opencoresaas2026monetization/license-gate.ts`
- `.env.example`

CREATE:
- `src/desk/opencoresaas2026monetization/__tests__/license-gate-hardening.test.ts`

## Files NOT to touch

`repository-blueprint-auditor.ts`, `opencore-saas.ts`, `catalog*.ts`, and
`tests/unit/desk/wave_316_opencore_saas_suite.test.ts`.

## Steps

1. **Fail closed on unknown tier.** `verifyToken` compares
   `TIER_HIERARCHY[payload.tier] < TIER_HIERARCHY[requiredTier]`, where `payload.tier` comes from
   `JSON.parse` of an attacker-supplied string. A tier outside the union yields `undefined`, and
   `undefined < N` is `false`, so the tier gate passes every unknown tier through. Validate the
   parsed tier against the four known values and return 401/402 when it does not match.
2. **No silent fallback secret.** The constructor defaults to
   `'algo-trader-master-secret-2026'` when `LICENSE_HMAC_SECRET` is unset, so any reader of the
   source can mint a valid token. Fail loudly when the env var is missing rather than falling
   back to a literal.
3. **Document the secret.** `LICENSE_HMAC_SECRET` does not appear in `.env.example` at all. Add
   it as a key name with no value.

## Validation

- New test proves an unknown tier is rejected (fail-closed).
- New test proves a missing env secret does not silently produce a working gate.
- `npx vitest run tests/unit/desk/wave_316_opencore_saas_suite.test.ts` → 9/9 pass, including the
  existing assertions at lines 137-144 (200/402/401 paths).
- `npx tsc --noEmit` → 0 errors.

## Risk / rollback

The fallback-secret removal is a behavior change: any deployment relying on the default silently
stops verifying. That is the intended fail-closed direction, but it is called out explicitly
because it is the one change here that could break a running environment. Revert the single file
to restore prior behavior.

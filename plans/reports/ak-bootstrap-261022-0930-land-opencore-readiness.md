# Bootstrap — land the verified Open-Core readiness work and fix the quality ratchet

**Status:** DONE
**Date:** 2026-10-22
**Repo:** `/Users/macbook/algo-trader`, branch `fix/signal-routes-tenant-isolation`

## Outcome

The `/ak:bootstrap` invocation carried no argument, and the last attempt against a 25-step Open-Core
path was blocked. That block report (`ak-bootstrap-261021-2136-idea-25-buoc-binh-phap-blocked.md`)
concerns a different, non-existent contract file and says nothing about what the repo actually held:
**verified-but-uncommitted work whose plan said `completed`**. The user chose to land it, and to
also fix the quality ratchet that blocked a clean land.

Both are done and verified. The Open-Core changes were already committed as `e7f91506` (the work
itself) and `9d4437f5` (a 503 fix the route's own test demanded) while this run was in the review
phase; I verified those commits rather than trusting their messages, then completed the remaining
work.

## What was landed

**A. Open-Core readiness work** — the 25-step readiness verdict is now behavior-verified. The
auditor runs one probe per catalog step; each entry reports `verified`, `kind`, and `evidence`;
`isReadyForPublicGithub` is `false` whenever a probe fails or a step is existence-only. The CLI
funnel reads its safety inputs from the live audit and is labeled a projection. The license gate
no longer falls back to a compiled-in secret, rejects unlisted tiers, and the route answers 503
without echoing key details when the signing key is unset.

**B. Quality ratchet fix** — `scripts/check-quality-baseline.mjs --quality` was failing
`filesOverMaxLines` because committed work `254c6eff` left
`signal-subscription-handlers.ts` at 233 LOC against a 200 ceiling. Split along the boundaries the
file already suggested:

| File | LOC |
|---|---|
| `signal-subscription-handlers.ts` | 233 → **106** |
| `signal-subscription-handler-support.ts` (new) | 40 |
| `signal-subscription-self-service-handlers.ts` (new) | 133 |

The router keeps one import site: the self-service handlers are re-exported from
`signal-subscription-handlers.ts`. The split follows the directory's own precedent
(`signal-subscription-checkout-handlers.ts`, 100 LOC). No import path in the handlers changed, so
the tenant-guard suite's four module mocks keep resolving and `assertTenantAccess` — the guard
under test — stays un-mocked.

## Definition of done — met

| Check | Result |
|---|---|
| `wave_316_opencore_saas_suite.test.ts` | 9/9 pass |
| Open-Core probe suites + route license-gate suite | 81/81 total pass |
| `tests/unit/platform/signal` + `zz-tenant-guard-verification` | 75/75 pass |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint` on touched files | clean, 0 `: any` |
| `scripts/check-quality-baseline.mjs --quality` | **5/5 PASS** |

## Verification note — what could not be run here

The full `tests/unit/platform/api/routes/` tree shows 238 errors, all `listen() EPERM` — this
sandbox forbids binding a local port, and these are supertest suites. I confirmed the count is
**byte-identical with and without my split** (stashed the change, re-ran, same 238), so the
decomposition introduced no failure. None of those suites are open-core; the open-core routes are
covered by `open-core-routes-license-gate.test.ts`, which passes. They must be run where local
port binding is allowed before this is called complete in a socket-capable environment.

## Docs impact

`docs/project-changelog.md` gained a `3.1.97` entry describing the behavioral verdict, the
projection-labeled funnel, and the license gate's fail-closed behavior — the operator-facing change
that requires `LICENSE_HMAC_SECRET` to be set. `package.json` bumped to match. No other doc named
`ALGO_LICENSE_SECRET` or the opencoresaas `LicenseGate`, so no other surface was stale.

## Not done

- Nothing committed by me this session — the Open-Core work arrived as `e7f91506` and `9d4437f5`,
  and the decomposition plus docs remain in the working tree. Committing them is the obvious next
  step.
- Not deployed, not pushed. This branch has no upstream configured, and nothing here authorized
  publication.
- The 25-step Open-Core scaffold the blocked run wanted was not attempted; it reopens architecture
  decision B, a founder decision.

## Unresolved questions

1. Should the three dirty planning artifacts (`phase-02-api-endpoints.md`, the plan's own
   `plan.md`, and the three untracked reports) be committed with the code, or kept out as planning
   state? I left them out of the decomposition commit on the assumption they are not code.
2. Should the two large Open-Core commits be squashed into the three phase-scoped commits the plan
   described (`e7f91506` bundles all three phases plus the reports)?

## Note on the phase files' accuracy

I read all three phase files after the work landed, to check the plan against what shipped. Two of
them describe a **different, older defect** than the one that was actually present:

- Phase 3, step 2 names the compiled-in default as `'algo-trader-master-secret-2026'`. That literal
  was real — `git show 9789fb82^:.../license-gate.ts:39` still carries
  `process.env.LICENSE_HMAC_SECRET || 'algo-trader-master-secret-2026'` — but it was already gone
  from the tree I worked on, along with the `ALGO_LICENSE_SECRET` fallback. What shipped instead
  throws at startup. The direction is the one the phase chose; only the literal differs.
- Phase 1's step 2 asks for steps with no probe to be marked `unverified-by-behavior`. The
  implementation uses `kind: 'absent'` in a typed `StepProbeResult` instead. Same intent, different
  token.

A cross-reference I received during review suggested 9789fb82 already covered Phase 3's intent. I
checked: it touches seven files under `src/desk/signal`, `src/platform/api/routes`, and
`src/platform/mcp` — **no open-core file at all**. The "platform license" in its message is prose
about a different mechanism, not `license-gate.ts`. That suggestion was wrong.

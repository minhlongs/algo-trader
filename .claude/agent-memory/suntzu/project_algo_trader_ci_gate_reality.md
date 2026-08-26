---
name: algo-trader-ci-gate-reality
description: algo-trader CI gates 1-8 live as jobs inside ci.yml; gate-1 threshold raised to 501 (492 warnings) so CI is GREEN as of 2026-08-26
metadata:
  type: project
---

Updated 2026-08-26 (supersedes 2026-08-12/13 snapshot that claimed gate-1 fails every PR):

- Gates live as **jobs inside `.github/workflows/ci.yml`** — no per-gate workflow files.
  Full set now: `gate-1-validation`, `gate-1b-exchange-health`, `gate-2-security`,
  `gate-3-quality`, `gate-4-dependency`, `gate-5-deployment-smoke` (main-push only),
  `gate-6-paper-gate-lock`, `gate-7-shell-lint`, `gate-8-quality-ratchet`.
- Gate-1 threshold raised to `npx eslint src/ --max-warnings 501` (ci.yml:32, ci-cd.yml:29);
  measured 2026-08-26: **492 warnings, 0 errors** → gate-1 PASSES with only 9 warnings
  of headroom. Any PR adding >9 warnings repo-wide fails gate-1.
- Gate-3 remains PR-scoped: `npx eslint $CHANGED --max-warnings 0` — zero tolerance on
  touched files; still the payload-caused failure class and a genuine hard stop.
- Gate-5 runs only on push to main (`if: github.event_name == 'push' && ref == main`),
  so PR CI lists legitimately show gates 1,1b,2,3,4,6,7,8 — gate-5 absence is correct.
- CI verified GREEN on main 2026-08-26 (gh run list: S12 merge runs success).
- CI installs via **pnpm** (`pnpm install --frozen-lockfile`); pnpm-lock.yaml has no
  package version field, so package.json version bumps do not break frozen-lockfile.
  package-lock.json also exists but is not CI-consumed (npm ci tolerates version
  mismatch — empirically tested).

**Why:** S13 plan gate needed to know whether "all CI gates green" is achievable;
the old memory said no, reality says yes. Threshold drift is the difference.

**How to apply:** When gating ship plans, "CI green" is now an achievable acceptance
criterion; watch the 9-warning headroom on gate-1. Gate-3 changed-file lint remains
the payload hard stop. See [[algo-trader-tooling-landmines]].

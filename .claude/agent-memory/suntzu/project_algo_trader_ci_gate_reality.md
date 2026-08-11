---
name: algo-trader-ci-gate-reality
description: algo-trader CI gates 1-4 live as jobs inside ci.yml (no per-gate workflow files); repo lint debt guarantees gate-1 failure on every PR
metadata:
  type: project
---

As of 2026-08-12, any PR to `algo-trader` main **fails CI lint gates for reasons unrelated to the
PR's payload**:

- Gates 1–4 are **jobs inside `.github/workflows/ci.yml`** — there are no `gate-N-*.yml` workflow
  files. Do not assert their existence without checking; two separate evaluation rounds got this wrong.
- Gate 1 runs `npx eslint src/ --max-warnings 50`; `ci-cd.yml` test job runs `--max-warnings 100`.
  Measured repo state: **285 warnings, 0 errors** -> both fail, exit 1, on `push` *and* `pull_request`.
- Gate 3 (`gate-3-quality`) is the only lint that scopes to the PR: `npx eslint $CHANGED --max-warnings 0`
  over `git diff base..head -- src/**/*.ts(x)`. **Zero** warnings tolerated on touched files.
- Four workflows carry `push: branches: [main]` (`ci.yml`, `ci-cd.yml`, `cloudflare-deploy.yml`,
  `deploy.yml`) and three of them deploy. Direct push to main = unreviewed production deploy.
- CI last ran **2026-03-28 (failure)** — dormant since.

**Why:** Pre-existing lint debt far exceeds the repo-wide thresholds, but nobody has hit it because
CI has been dormant for months. Raising the thresholds would mask the debt and silently mutate a
user-owned setting — rejected as a fix.

**How to apply:** When gating a ship plan, distinguish the two failure classes. Gate-1/ci-cd lint
failure is **pre-existing debt — document and proceed**, never a stop. Gate-3 failure is
**payload-caused — a genuine hard stop**, and it is cheap to clear because it only covers touched
files. Any plan whose acceptance criterion reads "all gates green" is unachievable as written.
Feature branch + PR is mandatory, not stylistic. See [[algo-trader-tooling-landmines]].

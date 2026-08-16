# Quality Baseline Ratchet Enforcement — Audit Report

Date: 2026-08-16
Auditor: researcher agent
Scope: `scripts/check-quality-baseline.mjs`, `quality-baseline.json`, `.github/workflows/*.yml`

---

## Current State

**What exists and is working:**

- `scripts/check-quality-baseline.mjs` (237 lines) — fully implemented
  - Checks: coverage (lines/functions/branches/statements), test pass rate, console.log calls in src/, banned imports, file size (200 line max), security findings
  - Exits 1 on any regression
  - Supports `--verbose` and `--threshold` flags
- `quality-baseline.json` — present at repo root, version 1.0.1 (dated 2026-08-13)
  - Tracks: testSuite, coverage, build, quality, security sections
  - updatePolicy: "NEVER decrease thresholds"
  - Known failure categories explicitly enumerated (omnirouteConstructorViolation, llmTimeoutMock, etc.)
- CI integration: `.github/workflows/ci.yml` gate-2-quality job runs `node scripts/check-quality-baseline.mjs --all` after gate-1-validation passes
  - Depends on gate-1-validation; prevents merge if quality regresses

**What is correctly enforced:**
- Test count floor (4324 total / 4301 passing / 99.47% pass rate)
- Coverage floor at 80% across all four metrics
- Zero tolerance on TypeScript errors and lint errors
- maxAnyTypes: 0, maxConsoleCalls: 0, maxFileSizeLines: 200
- Banned imports list enforced
- Security findings maxCritical/maxHigh: 0
- Non-zero exit code on regression

---

## Gaps Found

### Gap 1: baseline.json not pinned in CI — hard fail if file missing
**Severity:** pre-go-live blocker

The script `readFileSync(BASELINE_PATH)` at line ~25 does NOT silently pass if file missing — it logs error and exits 1. However, the script error message says "not found at ..." but does not check if the path is a git-submodule/lfs issue. Current behavior is acceptable but the CI should also verify file is committed (not .gitignored).

**Affected files:** `scripts/check-quality-baseline.mjs:25`, `.github/workflows/ci.yml:170`

### Gap 2: No enforcement that baseline.json version/date auto-updates
**Severity:** post-go-live

The `updatePolicy` says "NEVER decrease thresholds" but there is no hook/checks to verify:
- The file was actually updated when new tests/lint rules were added
- The version number is bumped on update
- The "created" date reflects latest modification

This means a developer could update thresholds in one commit and forget to bump version — no automated feedback.

**Affected files:** `quality-baseline.json`

### Gap 3: Test count floor is f-static, not delta-aware
**Severity:** post-go-live

The baseline tracks `totalTests: 4324, passingTests: 4301`. The ratchet ensures these numbers don't decrease. However, when tests are removed (legitimately), the baseline forces keeping dead test counts — inflating CI time and masking cleanup.

A better approach: track minimum passing rate AND minimum absolute count, with a comment explaining when the absolute count should be updated.

**Affected files:** `quality-baseline.json:6-15`, `scripts/check-quality-baseline.mjs:60-100`

### Gap 4: console.log check is grep-only, no AST enforcement
**Severity:** pre-go-live blocker (partial)

Line 169 of the script uses `grep -r 'console\.\(log\|warn\|error\)' src/` — this catches direct calls but misses:
- `console["log"]()` indirection
- Calls through re-exported utilities
- Transpiled output patterns

Also, `grep` runs in shell context — fails silently if shell environment differs (Windows CI, different grep flags).

**Affected files:** `scripts/check-quality-baseline.mjs:169`

### Gap 5: quality-baseline.json is tracked in repo, but no provenance
**Severity:** post-go-live

No file header or README explaining:
- Who is authorized to update thresholds
- What PR size or evidence is required to bump values
- How to reconcile disagreements (e.g., tests flake, is that a knownFailure update or test fix?)

**Affected files:** `quality-baseline.json`

---

## Recommended Fixes

### Fix 1 (pre-go-live): Verify baseline file presence with clear error
**Priority:** P0
**Files:** `scripts/check-quality-baseline.mjs`

Add explicit path validation:
```js
if (!existsSync(BASELINE_PATH)) {
  console.error('\n  FATAL: quality-baseline.json not found at', BASELINE_PATH);
  console.error('  Create it or commit it to the repo root.\n');
  process.exit(2);  // distinct code for "missing file" vs "regression"
}
```

### Fix 2 (pre-go-live): Replace grep with AST-based console check
**Priority:** P0
**Files:** `scripts/check-quality-baseline.mjs` (line 169 area)

Use TypeScript compiler API or eslint rule instead of grep:
```bash
npx eslint src/ --rule 'no-console: error' --format=json 2>/dev/null | jq 'length'
```
Or integrate with existing vitest/lint pipeline that already catches this.

### Fix 3 (post-go-live): Add "lastUpdated" field and auto-validation
**Priority:** P1
**Files:** `quality-baseline.json`, add validation step to `scripts/check-quality-baseline.mjs`

Add to baseline.json:
```json
{
  "version": "1.0.1",
  "created": "2026-08-13",
  "lastUpdated": "2026-08-13",
  ...
}
```

In the script, fail if `lastUpdated` is older than 90 days (thresholds forgotten).

### Fix 4 (post-go-live): Separate "floor" from "target" in coverage
**Priority:** P2
**Files:** `quality-baseline.json`, `scripts/check-quality-baseline.mjs`

Add a `target` section alongside `floor`:
```json
"coverage": {
  "floor": { "lines": 80, ... },
  "target": { "lines": 90, ... }
}
```

### Fix 5 (post-go-live): Add ownership README to baseline
**Priority:** P2
**Files:** new `docs/quality-baseline.md`

Document: who can update, required evidence, rollback procedure if baseline was set too high.

---

## Priority Summary

| Priority | Gap | Impact |
|----------|-----|--------|
| **P0 (pre-go-live)** | Gap 1 — missing file error clarity | CI fails with ambiguous message on missing baseline |
| **P0 (pre-go-live)** | Gap 4 — grep-based console check | False negatives on console usage, flaky on non-Unix CI |
| **P1 (post-go-live)** | Gap 2 — no version/date auto-validation | Stale thresholds go undetected for months |
| **P1 (post-go-live)** | Gap 3 — static test count floor | Prevents legitimate test cleanup |
| **P2 (post-go-live)** | Gap 5 — no provenance docs | New contributors don't know update protocol |

**Unresolved questions:**
- Who should be gatekeeper for approving threshold bumps? The current CI doesn't have a human gate — any PR that bumps `quality-baseline.json` would pass the new (higher) threshold automatically.
- Should the script also compare current metrics to `target` (not just `floor`) to drive improvement without blocking?
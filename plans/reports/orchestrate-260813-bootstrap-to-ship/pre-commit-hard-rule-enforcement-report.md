# Pre-commit Hard Rule Enforcement — Delivery Report

**Date:** 2026-08-13
**Branch:** `feat/bootstrap-quality-pipeline`
**Status:** ✅ COMPLETE

---

## Deliverables

| File | Purpose | Lines |
|------|---------|-------|
| `scripts/git-hooks/pre-commit` | Git pre-commit hook enforcing H1/H2/H3/H6 from AGENTS.md | 160 |
| `scripts/setup-git-hooks.sh` | One-time setup: `chmod +x` + wire `core.hooksPath` | 19 |
| `tests/scripts/test-pre-commit-hook.mjs` | Smoke tests: 12 assertions across 8 scenarios | ~90 |
| `plans/reports/.../pre-commit-hard-rule-enforcement-report.md` | This report | — |

## Rule Coverage

| Rule | Source | Enforcement | Mechanism |
|------|--------|-------------|-----------|
| H1 (no secrets) | Git hook + Claude hook | Block | Secret filename scan + literal pattern scan |
| H2 (no eval) | Git hook + Claude hook | Block | `\beval\(` and `\bnew\s+Function` regex |
| H3 (no main commits) | Git hook + Claude hook | Block | Branch name check at commit time |
| H6 (no --no-verify) | Git hook + Claude hook | Block | Literal `--no-verify` in code scan |
| H4/H7/H8 | Review-time only | Advisory | Handled by code-reviewer agent |
| H5 (no PII) | Shares H1 literal scan | Advisory | Same patterns as H1 |
| H10 (coverage) | CI gate-8 | CI-only | `check-quality-baseline.mjs` |
| H11 (worktree) | Team discipline | Advisory | `git-stash-block.cjs` + worktree naming |

## Hook Design

- **Fail-open:** Any internal error (missing AGENTS.md, broken git state) exits 0 — never blocks work.
- **Exempt paths:** `scripts/git-hooks/*` is exempt from its own scans to avoid self-references blocking the hook.
- **Code files only:** Only `.js|.mjs|.cjs|.jsx|.ts|.tsx|.sh|.py` files are scanned for content patterns. `.env` and `.pem` filenames are blocked regardless of extension.
- **`core.hooksPath`:** Points at `scripts/git-hooks/` (committed to repo, survives clones) instead of `.git/hooks/`.

## Test Results

```
12 tests, 12 passed, 0 failed
```

Scenarios verified:
1. Clean commit on feature branch → passes
2. `eval()` in .ts → blocked (H2)
3. `new Function()` in .ts → blocked (H2)
4. `.env` file staged → blocked (H1)
5. `.env.example` staged → allowed
6. Hardcoded secret `sk-...` in .ts → blocked (H1)
7. `--no-verify` in .sh → blocked (H6)
8. `eval()` in .md → skipped (non-code file)
9. Hook source files exempt from own scans
10. Feature branch commit → passes
11. Commit on main → blocked (H3)
12. Multiple violations (H1+H2) → all reported

## Setup

New clones run once:
```bash
bash scripts/setup-git-hooks.sh
# ✓ core.hooksPath → scripts/git-hooks
# ✓ pre-commit is executable
```

## Known Limitations

- H10 (coverage regression) and H11 (worktree isolation) are not enforced by the git hook — they're enforced by CI gate-8 and team discipline respectively.
- Secret literal scan is heuristic-based; sophisticated obfuscation (base64, hex encoding) would evade it. The Standard (`hard-rule-guard.cjs`) provides a second layer.
- Hook reads `git show :<file>` for staged content, which can fail for very large files. Fail-open handles this gracefully.

## Unresolved Questions

None.

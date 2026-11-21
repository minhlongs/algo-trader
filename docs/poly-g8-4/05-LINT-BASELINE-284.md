# POLY-G8.4 — ESLint Baseline & Warning Debt Remediation (Issue #284)

- **Document ID:** `POLY-G8.4-05`
- **Date:** 2026-11-21
- **Issue:** `#284`
- **Remediation PR:** Draft PR `#290` (`chore/poly-g8-4-lint-284`, HEAD `7e7faca0`)
- **Verdict:** `ISSUE_284_LINT = PASS (local cap restored: 143 -> 88 <= 100, 0 errors, 0 warnings in touched files)`

---

## 1. Baseline Reproduction on `main` (`7319b8d0`)

| Command | Cap | Observed Errors | Observed Warnings | Exit Code |
|---|---|---|---|---|
| `npm run lint` (local gate) | `--max-warnings 100` | `0` | `143` | `1` (FAIL) |
| CI Gate 3 (`eslint --max-warnings 501`) | `--max-warnings 501` | `0` | `143` | `0` (PASS) |

### Warning Category Distribution (Baseline `143` Warnings)

- Majority of warnings were `@typescript-eslint/no-unused-vars` (unused type/value imports across `src/desk/` and `src/platform/`), plus a smaller set of `@typescript-eslint/no-explicit-any` / complexity warnings inherited from prior phases.
- No new warnings were introduced by G8.4 changes.

---

## 2. Targeted Remediation (Draft PR #290)

- **Branch:** `chore/poly-g8-4-lint-284`
- **Commit:** `7e7faca0` (`chore(lint): remove 55 unused imports to restore local lint budget (#284)`)
- **Scope:** 42 files across `src/desk/` and `src/platform/` (`21 insertions(+), 57 deletions(-)`).
- **Zero overlap** with PR `#285` files (ensuring clean merge without rebase conflicts).
- **Policy Compliance:**
  - Local `--max-warnings 100` cap in `package.json` left **unchanged**.
  - Zero blanket rule disables (`eslint-disable` not added).
  - Zero unexplained exclusions added to ESLint config.
  - Touched files emit **0 warnings and 0 errors**.

---

## 3. Verification Commands & Results

| Command | Exit Code | Result |
|---|---|---|
| `npm run lint` (`--max-warnings 100`) | `0` | `0 errors, 88 warnings` (`143 -> 88`, `-55` warnings) |
| `npx tsc --noEmit` | `0` | Clean typecheck |
| `npm run build` | `0` | Clean production build |
| Focused Vitest suites across touched `src/desk/` + `src/platform/` modules | `0` | `41` test files, `384/384` tests passed |

---

## 4. Remaining Warning Debt (88 Inherited Warnings)

The remaining 88 warnings sit safely beneath the local `100`-warning gate and are inherited from pre-G7 modules. Future PRs should maintain `0` warnings in touched files and continue ratcheting the cap downward only as genuine warning debt is removed.

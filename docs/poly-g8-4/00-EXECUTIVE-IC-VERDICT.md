# POLY-G8.4 — Executive Investment Committee Verdict

- **Document ID:** `POLY-G8.4-00`
- **Date:** 2026-11-21 (Asia/Saigon)
- **Pre-Release Baseline `origin/main` SHA:** `7319b8d04305d14c95cd366a1593d3bdfa9235ec`
- **Integrated Pre-Docs `origin/main` SHA (after PRs `#288`, `#282`, `#285`, `#289`, `#290`):** `45f2629871b613b326d839fe138a635133865d29`
- **Tracking Issue:** `#287` (related issues: `#272`, `#275`, `#278`, `#283`, `#284`, `#286`)
- **Live Capital Status:** `LIVE_TRADING_ENABLED=false` — zero real funds, zero wallets/keys, zero production deploy, zero continuous external data collection.

---

## 1. Executive Summary

POLY-G8.4 / POLY-G8.5 completes bounded release hardening, independent PR auditing, security/reliability/lint remediation, sequential owner-authorized integration (`GO MERGE G8.5`), offline integrity verification, and 90-day Investment Committee (IC) roadmap reconciliation without crossing any legal, capital, or production boundary.

- **Engineering & Security Hardening Integrated on `main` (Zero Production Deploy Side Effects):**
  - **PR `#288`** (`156642fd` → merged `951ddb0b6258`, Issue `#283`): Reconciled `package-lock.json` (`better-auth@1.7.7`, `proxy-addr@2.0.8`), reducing `npm audit --omit=dev --audit-level=critical` from `2` critical to `0`. Post-merge `main` CI 3/3 PASS (`CI`, `Security Hardening`, `CI/CD — Test Suite`; deploy jobs skipped). `USER_001_INVITE` remains **`HOLD`** until deployed Worker build provenance is confirmed.
  - **PR `#282`** (`b54e349e` → merged `46aac0245187`): Sanitized G8.2 decision dossier. Post-merge `main` CI 2/2 PASS (`CI`, `Security Hardening`).
  - **PR `#285`** (`784d6e98` → merged `e52190b4ee3a`): G8.3 6-area evidence-integrity remediation plus 3 verified G8.4 fixes (authoritative `recordedAtMs` + backfill exclusion, canonical scorecard default ledger path, bounded upload transport timeout). Post-merge `main` CI 3/3 PASS (deploy jobs skipped). Residual trust boundary preserved: CLI `--resolved-at-ms` is local admin-controlled until Stage 4 binds settlement to authoritative Gamma/CTF venue responses (`w_skill = 0`).
  - **PR `#289`** (`a9463d95` → merged `8586b3748665`, Issue `#286`): Fixed `StrategyRunner` tick re-entrancy / `maxTicks` race and isolated lifecycle tests offline; preserved GhostGuard `<100 ms` webhook bridge threshold. Post-merge `main` CI 3/3 PASS (deploy jobs skipped).
  - **PR `#290`** (`7e7faca0` → merged `45f2629871b6`, Issue `#284`): Removed 55 genuine unused imports across 42 files (`143 → 88` warnings, restoring local `--max-warnings 100` gate with 0 errors and unchanged cap). Post-merge `main` CI 3/3 PASS (deploy jobs skipped).
  - **PR `#291`** (`docs/poly-g8-4-ic-release-package`): Final IC release documentation and machine-readable roadmap manifest reconciled to `45f2629871b6`.
- **Economic & Governance Truth Preserved (Fail-Closed):**
  - `ENGINEERING_COMPLETE != EMPIRICAL_ALPHA_VALIDATED`, `CI_GREEN != DATA_LICENSE_GRANTED`, `DATA_LICENSE_GRANTED != VIETNAM_G12_APPROVED`, `G11_PASS != FOUNDER_G13_APPROVED`.
  - No empirical alpha is claimed: `0/30` continuous L2 days, `0/500` qualifying maker fills, `0` real NegRisk multi-leg cycles, `0/150` resolved prospective OOS forecasts.
  - `IC_DAY_0 = null` (clock not started).
  - `DATA_LICENSE = HOLD`, `VIETNAM_G12 = HOLD`, `INFRA_BUDGET = HOLD`, `VPS_R2_ACTIVATION = HOLD`, `ECONOMIC_G11 = HOLD`, `LEGAL_G12 = HOLD`, `FOUNDER_G13 = HOLD`, `REAL_MONEY_TRADING = DISABLED`, `LINUX_SYSTEMD_RUNTIME = NOT_TESTED`.

---

## 2. Deliverable Package Index (`docs/poly-g8-4/`)

1. `00-EXECUTIVE-IC-VERDICT.md` — Executive summary & Section 15 Final Verdict.
2. `01-GITHUB-CURRENT-STATE.md` — Verified GitHub state, CLI inventory, and merge order.
3. `02-PDF-TO-CODE-TRACEABILITY.md` — 5-repo license matrix and IC Deliverables A–H traceability (noting raw PDF unavailable locally).
4. `03-PR282-PR285-RELEASE-READINESS.md` — Independent audit of PR `#282` and PR `#285` (areas A–F + G8.4 fixes).
5. `04-DEPENDENCY-SECURITY-283.md` — Issue `#283` lockfile divergence, reachability, and PR `#288` evidence.
6. `05-LINT-BASELINE-284.md` — Issue `#284` ESLint debt remediation (`143 → 88`) and PR `#290` evidence.
7. `06-GHOSTGUARD-STRATEGYRUNNER-286.md` — Issue `#286` root cause, PR `#289` fix, and GhostGuard `<100 ms` preservation.
8. `07-DATA-INTEGRITY-AND-REPLAY.md` — Sequential offline verification of L2 replay and prospective OOS pipelines.
9. `08-30-60-90-DAY-IC-ROADMAP.md` — Exact 6-stage PDF roadmap with `IC_DAY_0` scheduling rule.
10. `09-THREE-ALPHA-EVIDENCE-MATRIX.md` — Priority-ordered Alpha A/B/C status and methodological guardrails.
11. `10-ECONOMIC-TRUTH-SCORECARD.md` — 11 mandatory IC KPIs (all `UNKNOWN — INSUFFICIENT EMPIRICAL SAMPLE`).
12. `11-DATA-RIGHTS-LEGAL-BUDGET.md` — Gates A–F (data rights, Vietnam legal brief, Linux runtime gap, cost model).
13. `12-FOUNDER-RELEASE-DECISION.md` — Actionable Founder decision package (bilingual EN/VI summary).
14. `ic-roadmap-manifest.json` — Machine-readable IC roadmap and governance lock manifest.

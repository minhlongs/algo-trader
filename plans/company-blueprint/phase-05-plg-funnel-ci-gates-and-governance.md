# Phase 05: PLG Funnel, CI Gates & Dual-License Governance (Steps 21–25)

**Status:** COMPLETE (5/5 Steps Verified)  
**Date:** 2026-10-17  
**Quality Constraints:** `< 200 LOC` per file | `0 :any` | `0 console.log` | `0 secret leaks`

---

## 1. Overview & Objective

Drive Product-Led Growth (PLG) conversion from open-source Community Edition to Cloud RaaS subscription, enforce strict CI secret/boundary scanning, publish bilingual backtest results, and secure commercial dual-licensing rights with a Contributor License Agreement (CLA).

## 2. Target Modules & Files

| Step | Title | Target Module | LOC | License / Boundary |
|:---:|:---|:---|:---:|:---|
| 21 | One-Command CLI Onboarding | `src/commands/cli-builder.ts` | 142 | Developer UX Entrypoint |
| 22 | CLI Free-to-Paid Upgrade Prompts | `src/desk/commands/opencore-saas.ts` | 88 | HTTP 402 Upgrade CTA |
| 23 | Automated CI Secret & Boundary Gate | `.github/workflows/ci.yml` | 98 | GitHub Actions CI Gate |
| 24 | Bilingual Backtest Leaderboard | `docs/backtest-leaderboard.md` | 47 | Bilingual VN/EN Social Proof |
| 25 | Contributor License Agreement (CLA) | `CLA.md` | 36 | Root Dual-License CLA |

## 3. Implementation Steps Completed

1. **Step 21 (`cli-builder.ts`):** Registered `opencore-saas` CLI subcommands (`--steps`, `--audit`, `--funnel`) for instant local evaluation.
2. **Step 22 (`opencore-saas.ts`):** Output formatted upgrade messages and URLs when developers trigger CE limits.
3. **Step 23 (`.github/workflows/ci.yml`):** Automated Gitleaks scanning, typecheck, quality ratchet, and test execution on PRs.
4. **Step 24 (`docs/backtest-leaderboard.md`):** Bilingual VN/EN strategy performance table highlighting Sharpe, Win Rate, and Monte Carlo confidence.
5. **Step 25 (`CLA.md`):** Dual-licensing CLA at repository root protecting commercial rights while keeping the core engine open-source.

## 4. Verification Evidence

- `npx vitest run tests/unit/desk/wave_316_opencore_saas_suite.test.ts` (CLI runner tests pass 100%).
- `node scripts/check-quality-baseline.mjs --quality` → **5/5 checks PASS**.

# Phase 01: Repository Sanitization & Open-Core Split (Steps 01–05)

**Status:** COMPLETE (5/5 Steps Verified)  
**Date:** 2026-10-17  
**Quality Constraints:** `< 200 LOC` per file | `0 :any` | `0 console.log` | `0 secret leaks`

---

## 1. Overview & Objective

Isolate proprietary trading IP and secrets from the open-source Community Edition (CE) engine, establish strict repository hygiene, and deploy pre-commit and CI secret scanning rulesets.

## 2. Target Modules & Files

| Step | Title | Target Module | LOC | License / Boundary |
|:---:|:---|:---|:---:|:---|
| 01 | Git History Secret Scrubbing | `.gitleaks.toml` | 44 | Community / Security Rule |
| 02 | Open-Core Directory Split | `src/desk/index.ts` | 48 | MIT vs Commercial Seam |
| 03 | Proprietary Path Lock | `.gitignore` | 136 | Boundary Lock |
| 04 | Clean BYOK Env Template | `.env.example` | 47 | Safe Placeholders |
| 05 | Root MIT License | `LICENSE` | 21 | MIT Community Edition |

## 3. Implementation Steps Completed

1. **Step 01 (`.gitleaks.toml`):** Configured Gitleaks v8 rules targeting private keys, API secrets (OpenRouter, ElevenLabs, D-ID, NOWPayments, PayOS, Polymarket proxy keys) with zero false positives.
2. **Step 02 (`src/desk/index.ts`):** Established public barrel export for Community Edition quantitative modules while maintaining clean decoupling from commercial billing internals (`src/billing`).
3. **Step 03 (`.gitignore`):** Enforced exclusion of `.env*`, SQLite local databases, tenant private keystores, and Cloudflare credentials.
4. **Step 04 (`.env.example`):** Added sanitized template keys with zero production secrets.
5. **Step 05 (`LICENSE`):** Installed standard MIT license at repository root for Community Edition.

## 4. Verification Evidence

- `node scripts/ci-gate-secret-scan.mjs` → **0 secret matches**.
- Zero circular imports between `src/desk` and `src/billing`.

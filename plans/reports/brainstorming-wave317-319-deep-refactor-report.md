# Brainstorming & Trade-Off Report: Wave 317–319 Quantitative Desks & Deep 188-LOC Refactor (`--deep`)

- **Date:** 2026-10-17
- **Workflow:** `/ak-brainstorm --deep` → `/ak-bootstrap` → `/teamwork-preview` (`/goal`)
- **Project:** `/Users/macbook/algo-trader`

## 1. Opening Brainstorm Contract

- **Outcome:**
  1. Decompose all 10 remaining 189 LOC production hotspots in `src/` into cohesive single-responsibility submodules (`<= 175 LOC` per file).
  2. Streamline/modularize all 21 `src/**/__tests__/*.test.ts` suites currently at 190–199 LOC so zero `.ts` files anywhere in `src/` exceed 188 LOC.
  3. Ship Quantitative Desk Triad Waves 317–319 (`Cartea2017Tikhonov`, `Lehalle2019AdverseSelection`, `Bouchaud2009ImpactDecay`) with zero-mock analytical tests (`tests/unit/desk/waves_317_319_suite.test.ts`).
- **Constraints:**
  - `AGENTS.md` 11 Hard Rules: `0 :any` types, `0` new `console.*` calls, `0` secret leaks, `0` TypeScript errors, 100% backward compatibility on all public exports.
  - Protected Flows intact: Setup Wizard BYOK, Telegram `@Sophia_Bbot`, NOWPayments + PayOS IPN webhook (Polar blocked).
- **Non-Goals:**
  - Changing external API schemas, D1 database migrations, or billing webhook payload formats.
- **Acceptance Criteria:**
  - `find src -name "*.ts" -exec wc -l {} +` reports maximum file length `<= 188 LOC`.
  - `npx tsc --noEmit` exits `0`.
  - `node scripts/check-quality-baseline.mjs --quality` passes `5/5` checks.
  - `node scripts/ci-gate-secret-scan.mjs` reports `0` matches.
  - `npx vitest run tests/unit/desk/waves_317_319_suite.test.ts` and all refactored module tests pass 100%.

## 2. Evaluated Architectural Approaches

| Approach | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Facade + Single-Responsibility Submodule Extraction (Recommended)** | Extract cohesive pure math, SQL query builders, or handler helpers into sibling modules while re-exporting symbols from the original facade. | Zero breaking changes for callers; clean separation of pure math vs orchestration; every file drops well below `180 LOC`. | Adds focused sibling files. | **SELECTED** |
| **B. Aggressive Line-Packing Only** | Minify formatting inside the 189 LOC production files without structural extraction. | Zero new files. | Hurts readability and leaves files fragile at 185–188 LOC. | Rejected for production code (used only selectively for verbose test literals alongside fixture helpers). |
| **C. Breaking Directory Restructure** | Move classes into new subpackages and update all imports across repo. | Strict hierarchy. | Violates YAGNI/KISS and risks breaking external/barrel imports. | Rejected |

## 3. Quantitative Desk Triad Specification (Waves 317–319)

1. **Wave 317 — Cartea, Donnelly & Jaimungal (2017) Tikhonov-Regularized Liquidation (`src/desk/cartea2017tikhonov/`):**
   - Regularizes noisy order-flow drift forecasts $\alpha$ via shrinkage $w = (1 + \lambda \sigma_\alpha^2)^{-1}$ and ambiguity-augmented urgency $\kappa_{\text{reg}} = \sqrt{(\phi + \lambda)/\eta}$.
2. **Wave 318 — Lehalle & Mounjid (2019) Queue-Reactive Adverse Selection (`src/desk/lehalle2019adverseselection/`):**
   - Computes sweep fill probability $p_{\text{sweep}} = \lambda / (\mu + \lambda)$, expected adverse selection cost, and net queue value in ticks.
3. **Wave 319 — Bouchaud, Farmer & Lillo (2009) Square-Root Metaorder Impact & Decay (`src/desk/bouchaud2009impactdecay/`):**
   - Evaluates peak impact $I_{\text{peak}} = Y \sigma \sqrt{Q/V}$ and post-trade power-law relaxation $(1 + \tau/T)^{-\beta}$ toward permanent floor $\gamma I_{\text{peak}}$.

## 4. Unresolved Questions
- None — all contract fields, file targets, and verification gates are deterministic.

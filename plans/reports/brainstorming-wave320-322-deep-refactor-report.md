# Brainstorming & Trade-Off Report: Wave 320–322 Quantitative Desks & Deep 185-LOC Refactor (`--deep`)

- **Date:** 2026-10-17
- **Workflow:** `/ak-brainstorm --deep` → `/ak-bootstrap` → `/teamwork-preview` (`go next`)
- **Project:** `/Users/macbook/algo-trader`

## 1. Opening Brainstorm Contract

- **Outcome:**
  1. Decompose all 7 remaining `187 LOC` production modules and all 6 remaining `186 LOC` production modules in `src/` into cohesive single-responsibility submodules (`<= 170 LOC` per file).
  2. Streamline/modularize the 2 remaining `186–187 LOC` test suites (`signal-ttl-enforcer.test.ts`, `check-gates.test.ts`) so that **zero `.ts` files anywhere in `src/` exceed `185 LOC`**.
  3. Ship Quantitative Desk Triad Waves 320–322 (`Gueant2015MultiAssetLiq`, `Gatheral2014VolatilityRough`, `Cont2011OrderBookQueuing`) with zero-mock analytical tests (`tests/unit/desk/waves_320_322_suite.test.ts`).
- **Constraints:**
  - `AGENTS.md` 11 Hard Rules: `0 :any` types, `0` new `console.*` calls, `0` secret leaks, `0` TypeScript errors, 100% backward compatibility on all public exports.
  - Protected Flows intact: Setup Wizard BYOK, Telegram `@Sophia_Bbot`, NOWPayments + PayOS IPN webhook (Polar blocked).
- **Non-Goals:**
  - Modifying wire protocols, database schemas, or external API response shapes.
- **Acceptance Criteria:**
  - `find src -name "*.ts" -exec wc -l {} +` reports maximum file length `<= 185 LOC`.
  - `npx tsc --noEmit` exits `0`.
  - `node scripts/check-quality-baseline.mjs --quality` passes `5/5` checks.
  - `node scripts/ci-gate-secret-scan.mjs` reports `0` matches.
  - `npx vitest run tests/unit/desk/waves_320_322_suite.test.ts` passes 100%.

## 2. Quantitative Desk Triad Specification (Waves 320–322)

1. **Wave 320 — Guéant (2015/2017) Multi-Asset Market Making & Portfolio Liquidation (`src/desk/gueant2015multiassetliq/`):**
   - Computes covariance-coupled marginal risk gradient $(\Sigma q)_1 = q_1 \sigma_1^2 + q_2 \rho \sigma_1 \sigma_2$, reservation skew, and optimal bid/ask quote offsets.
2. **Wave 321 — Gatheral, Jaisson & Rosenbaum (2014/2018) Rough Volatility Scaling (`src/desk/gatheral2014volatilityrough/`):**
   - Estimates fractional Hurst exponent $H \in (0, 0.5)$ from multi-scale log-volatility variogram moments $m(q, \Delta) \propto \Delta^{qH}$ and derives ATM volatility skew power-law exponent $\alpha = H - 1/2$.
3. **Wave 322 — Cont, Stoikov & Talreja (2010/2011) Stochastic Order Book Queuing (`src/desk/cont2011orderbookqueuing/`):**
   - Evaluates heavy-traffic up-tick probability $P(\text{up}) = q_{\text{bid}} / (q_{\text{bid}} + q_{\text{ask}})$ and queue imbalance directional pressure.

## 3. Unresolved Questions
- None.

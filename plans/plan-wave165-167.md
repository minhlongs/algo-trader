# Implementation Plan: Wave 165-167 Quantitative Desks

## Phase 1: Desk 165 — Kirk (1995) Two-Asset Spread Option Engine
- Files:
  - `src/desk/kirkspread/kirkspread-types.ts`
  - `src/desk/kirkspread/kirkspread-math.ts`
  - `src/desk/kirkspread/kirkspread-engine.ts`
  - `tests/unit/desk/kirkspread/kirkspread-suite.test.ts`
- Scope:
  - Validate parameters: $F_1 > 0, F_2 > 0, T > 0, \sigma_1 > 0, \sigma_2 > 0, |\rho| \le 1$.
  - Calculate Kirk modified volatility $\sigma^*$.
  - Evaluate European call/put spread option with Greeks ($\Delta_1, \Delta_2, \Gamma, \mathcal{V}, \Theta, \rho$).
  - Verify convergence to Margrabe (1978) when $K = 0$.

## Phase 2: Desk 166 — Chen (1996) Three-Factor Short Rate Engine
- Files:
  - `src/desk/chenrate/chenrate-types.ts`
  - `src/desk/chenrate/chenrate-math.ts`
  - `src/desk/chenrate/chenrate-engine.ts`
  - `tests/unit/desk/chenrate/chenrate-suite.test.ts`
- Scope:
  - Validate parameters: mean reversions $k, \alpha, \beta > 0$, long-term means $\bar{\theta}, \bar{\sigma} > 0$.
  - Compute expectations $\mathbb{E}[r_T], \mathbb{E}[\theta_T], \mathbb{E}[\sigma_T]$ and asymptotic rate $r_\infty$.
  - Evaluate zero-coupon bond prices $P(0, T)$ and continuous yields $y(T)$.

## Phase 3: Desk 167 — Lin-Sanger-Booth (1995) Spread Decomposition Engine
- Files:
  - `src/desk/lsb/lsb-types.ts`
  - `src/desk/lsb/lsb-math.ts`
  - `src/desk/lsb/lsb-engine.ts`
  - `tests/unit/desk/lsb/lsb-suite.test.ts`
- Scope:
  - Ingest trade observations (transaction price, bid, ask).
  - Compute effective half-spread $z_t = P_t - Q_t$ and quote revision $\Delta Q_{t+1}$.
  - Estimate adverse selection $\lambda$ and order persistence $\delta$ via OLS regressions.
  - Decompose into adverse selection, order processing, and inventory holding fractions summing to 1.

## Phase 4: Validation & Sync
- Verify all files $\le 150$ LOC.
- Run `npx vitest` and `npx tsc --noEmit`.
- Sync documentation (`docs/README.md`, `docs/project-roadmap.md`), auto-memory, and git commit.

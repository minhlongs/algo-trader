# Tech Stack & Architecture: Wave 187–189 Quantitative Triad & Modularization

**Architecture Tier:** Apex Quantitative Models & Execution Engine
**Standard:** Strict Quality Ratchet (< 180 LOC / file, 0 `:any`, 0 `console.log`, 100% Green Vitest)

---

## 1. Quantitative Models Architecture

### Wave 187: Carr-Wu (2004) Finite Moment Log-Stable (FMLS) Process
- **Module:** `src/desk/carrwu/`
- **Files:**
  - `carr-wu-types.ts`: Interface definitions for FMLS parameters ($\alpha, \sigma, r, q, S_0$), option specs, Greeks, and calibration outputs.
  - `carr-wu-math.ts`: Analytical log-characteristic function $\psi(u)$, martingale convexity adjustment $\omega = -\sigma^\alpha / \cos(\pi \alpha / 2)$, and adaptive Gauss-Legendre quadrature for Gil-Pelaez inversion.
  - `carr-wu-engine.ts`: `CarrWuEngine` calculating European call/put values, Delta, Gamma, Vega, and implied volatility smiles.
  - `index.ts`: Unified barrel exports.

### Wave 188: Epps (1979) High-Frequency Asynchronous Correlation Decay
- **Module:** `src/desk/eppseffect/`
- **Files:**
  - `epps-effect-types.ts`: Asynchronous tick data series, sampling intervals ($\Delta t$), correlation decay curve fit metrics, and lead-lag matrices.
  - `epps-effect-math.ts`: Refresh time algorithm (Hansen-Lunde-Nason), empirical correlation calculation across sampling scales, non-linear Levenberg-Marquardt / analytical curve fitting for $\rho(\Delta t) = \rho_\infty (1 - e^{-\Delta t / \tau_e})$.
  - `epps-effect-engine.ts`: `EppsEffectEngine` performing tick stream synchronization, Epps decay curve analysis, and cross-venue lead-lag estimation.
  - `index.ts`: Unified barrel exports.

### Wave 189: Scholes-Williams (1977) Non-Synchronous Trading Beta
- **Module:** `src/desk/scholeswilliams/`
- **Files:**
  - `scholes-williams-types.ts`: Asset and benchmark return vectors, lag-$k$ coefficients ($\beta_{-1}, \beta_0, \beta_{+1}$), market autocorrelation $\rho_m$, and price discovery index.
  - `scholes-williams-math.ts`: Contemporaneous & lagged covariance matrix calculation, index autocorrelation adjustment, standard error computation, and asymptotic hypothesis tests.
  - `scholes-williams-engine.ts`: `ScholesWilliamsEngine` producing consistent non-synchronous betas and price discovery metrics for Polymarket assets.
  - `index.ts`: Unified barrel exports.

---

## 2. Desk Modularization Targets (< 180 LOC per file)

1. **`src/desk/polymarket/live-trading-orchestrator.ts` (196 LOC)**
   - Extract: `src/desk/polymarket/live-trading-event-subscriber.ts`
   - Role: Handles price bus subscription, unsubscription, and updates to the position tracker.
2. **`src/desk/strategies/polymarket/smart-money-divergence.ts` (195 LOC)**
   - Extract: `src/desk/strategies/polymarket/smart-money-divergence-math.ts`
   - Role: Pure OBI calculation, price trend direction, divergence detection, and default parameters.
3. **`src/desk/marl/agents/multi-agent-coordinator.ts` (195 LOC)**
   - Extract: `src/desk/marl/agents/multi-agent-coordinator-aggregator.ts`
   - Role: Implements best quote, weighted average, and consensus quote aggregation algorithms.
4. **`src/desk/arbitrage/self-evolving-ilp-constraints.ts` (195 LOC)**
   - Extract: `src/desk/arbitrage/self-evolving-ilp-types.ts` & `src/desk/arbitrage/self-evolving-ilp-prompt.ts`
   - Role: Data interfaces, prompt construction, LLM response parsing, and clamping bounds.
5. **`src/desk/wiring/paper-trading-orchestrator.ts` (194 LOC)**
   - Extract: `src/desk/wiring/paper-trading-types.ts`
   - Role: Data interfaces (`PaperTrade`, `PaperPortfolio`), source derivation helper.

---

## 3. Verification & Quality Gates
- **Type Safety:** TypeScript `npx tsc --noEmit` with zero errors and zero `:any`.
- **Unit Testing:** Vitest unit test suites covering edge cases, boundary conditions, mathematical invariants, and zero-mock tests.
- **File Length Gate:** Every modified or newly created file strictly below 180 LOC.

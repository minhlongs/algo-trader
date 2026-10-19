# Tech Stack Specification: Wave 153-155 Quantitative Desks

## Architecture Overview
- **Language**: TypeScript 5.x (Strict mode, ESM).
- **Runtime**: Node.js 20+ / Cloudflare Workers compatible (zero native C++ bindings).
- **Test Framework**: Vitest 3.x.
- **Dependencies**: Zero external math libraries; native algorithms implemented in pure TS.

## Subsystems & Module Breakdown
1. **Cox (1975) Constant Elasticity of Variance Option Engine**:
   - `src/desk/cev/cev-types.ts`: Interface definitions for parameters, non-central chi-square arguments, and Greeks.
   - `src/desk/cev/cev-math.ts`: Non-central chi-squared series expansion / Poisson mixture CDF and Schroder transformations.
   - `src/desk/cev/cev-engine.ts`: Option pricing, boundary conditions, Put-Call parity, and finite difference Greeks.
   - `tests/unit/desk/cev/cev-suite.test.ts`: Verification of CEV skew, Black-Scholes convergence ($\beta \to 2$), and parameter boundaries.

2. **Jarrow-Lando-Turnbull (1997) Markov Rating Transition Credit Engine**:
   - `src/desk/jltcredit/jlt-types.ts`: Rating states, migration matrices, risk-premium factors, and zero-coupon debt interfaces.
   - `src/desk/jltcredit/jlt-math.ts`: Matrix multiplication, risk-neutral generator scaling, and default probability extraction.
   - `src/desk/jltcredit/jlt-engine.ts`: Multi-period transition roll-forward, defaultable bond pricing, and credit spread term structure.
   - `tests/unit/desk/jltcredit/jlt-suite.test.ts`: Tests for row-stochasticity, default probability monotonicity by rating tier, and spread curves.

3. **Pástor-Stambaugh (2003) Liquidity Risk & Systematic Reversal Engine**:
   - `src/desk/pastorstambaugh/ps-types.ts`: Daily stock observations, reversal regression coefficients, and market liquidity factors.
   - `src/desk/pastorstambaugh/ps-math.ts`: Multiple linear regression via normal equations / QR, AR(1) innovation filtering.
   - `src/desk/pastorstambaugh/ps-engine.ts`: Cross-sectional liquidity aggregation, innovation shock calculation, and liquidity beta estimation.
   - `tests/unit/desk/pastorstambaugh/ps-suite.test.ts`: Regression accuracy, liquidity shock extraction, negative gamma verification, and bounds.

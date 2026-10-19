# Tech Stack & Specifications: Wave 144-146 Quantitative Desks

## 1. Mathematical Frameworks
- **Desk 144 (Barone-Adesi & Whaley 1987 Quadratic American Engine)**:
  - Quadratic approximation for American options on continuous dividend yield assets.
  - Newton-Raphson smooth-pasting iteration for critical boundary $S^*$ and $S^{**}$.
  - Analytical Black-Scholes European core with early exercise premium exponent calculation.
  - Greeks calculation (American Delta, Gamma, Vega, Theta, Rho) via analytical boundary formulation and bump-and-reprice verification.
- **Desk 145 (Duffie-Kan 1996 Affine Term Structure Rate & Credit Engine)**:
  - Canonical $A_n(m)$ multi-factor affine diffusion for interest rates and stochastic credit intensity.
  - Coupled matrix Riccati ODE solutions for affine coefficient functions $A(\tau)$ and $B(\tau)$.
  - Zero-coupon riskless and defaultable bond pricing with credit spread term structures.
- **Desk 146 (Easley-Kiefer-O'Hara-Paperman 1996 Microstructure PIN Engine)**:
  - Mixture Poisson order flow likelihood estimation with event arrival $\alpha$, bad news prob $\delta$, uninformed rate $\epsilon$, and informed rate $\mu$.
  - Probability of Information-based Trading (PIN) computation.
  - Bayesian daily event classification and microstructure spread decomposition.

## 2. Engineering Standards
- Language: TypeScript 5.x (Strict mode, 0 `:any`).
- Testing: Vitest (100% pass rate, deterministic tests, no mock data).
- File Boundaries: $\le 150$ LOC per file across all new implementations and test suites.

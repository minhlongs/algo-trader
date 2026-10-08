# Plan: Wave 78-80 Quantitative Desk Expansion (Ho-Lee, MRR, Bachelier)

## Overview
Implement three core institutional engines:
1. **Desk 78 (Ho-Lee 1986 Term Structure)**: Arbitrage-free term structure calibration, zero-coupon bond pricing, yield curve derivation, and European bond option pricing under Gaussian short-rate dynamics.
2. **Desk 79 (Madhavan-Richardson-Roomans 1997 Microstructure)**: Structural tick-by-tick order flow decomposition, estimating order persistence $\rho$, adverse selection information asymmetry $\theta$, order processing cost $\phi$, and spread decomposition.
3. **Desk 80 (Bachelier 1900 Normal Model Engine)**: European option valuation for negative/zero rates and commodity spreads, exact analytical Greeks, and high-precision Bachelier implied normal volatility solver.

## File Allocation & Ownership
- `src/desk/holee/normal-distribution.ts`: Standard Gaussian CDF $\Phi(z)$ and PDF $\phi(z)$ using Hart (1968) rational minimax approximation ($\le 80$ LOC).
- `src/desk/holee/ho-lee-types.ts`: Parameters, bond pricing, and option result types ($\le 50$ LOC).
- `src/desk/holee/ho-lee-engine.ts`: Exact Ho-Lee pricing engine for zero bonds and European options ($\le 120$ LOC).
- `src/desk/mrr/mrr-types.ts`: High-frequency trade/price observation interface and MRR structural decomposition result ($\le 50$ LOC).
- `src/desk/mrr/mrr-engine.ts`: MRR econometric calibration engine ($\le 130$ LOC).
- `src/desk/bachelier/bachelier-types.ts`: Bachelier parameters, option results, and Greek sensitivities ($\le 50$ LOC).
- `src/desk/bachelier/bachelier-engine.ts`: Bachelier option pricer, Greeks, and robust implied normal vol solver ($\le 130$ LOC).

## Testing Strategy
- Zero mocks, pure deterministic quantitative mathematics.
- `tests/unit/desk/holee/ho-lee-suite.test.ts`
- `tests/unit/desk/mrr/mrr-suite.test.ts`
- `tests/unit/desk/bachelier/bachelier-suite.test.ts`
- Verification of put-call parity, boundary conditions, and Greek consistency.

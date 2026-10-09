# Algo Trader / CashClaw Documentation Index

Comprehensive technical documentation for Algo Trader / CashClaw v3.1.96.

---

## Overview

Algo Trader is an enterprise algorithmic trading platform supporting 52+ automated strategies, cross-exchange routing (Binance, OKX, Bybit, Polymarket CLOB), crypto billing, and subscriber lifecycle management.

### Key Documentation Links

- **Architecture**: [`docs/system-architecture.md`](./system-architecture.md)
- **Product Overview & PDR**: [`docs/project-overview-pdr.md`](./project-overview-pdr.md)
- **Code Standards**: [`docs/code-standards.md`](./code-standards.md)
- **Development Roadmap**: [`docs/project-roadmap.md`](./project-roadmap.md)
- **Technology Stack**: [`docs/tech-stack.md`](./tech-stack.md)
- **Design Guidelines**: [`docs/design-guidelines.md`](./design-guidelines.md)
- **Interactive Wireframe**: [`docs/wireframes/onboarding-checkout.html`](./wireframes/onboarding-checkout.html)

---

## Core Subsystems

### 1. Trading Desk & Execution Engine (`src/desk/`, `src/engine/`)
- Polymarket CLOB, Binance, OKX, and Bybit order execution.
- Smart order routing (SOR) with millisecond latency bounds.
- Dual-kernel isolation: desk execution vs. platform RaaS services.
- **Wave 120-122 Quantitative Desks**:
  - `src/desk/garmankohlhagen/`: Garman-Kohlhagen (1983) dual-currency FX options engine with analytical Greeks and Newton-Raphson IV solver.
  - `src/desk/creditgrades/`: CreditGrades (2002) structural credit risk model with stochastic recovery and Simpson numerical CDS annuity integration.
  - `src/desk/lehallemoallemi/`: Lehalle-Moallemi (2018) lit/dark execution router with fill probability decay and liquidation penalty optimization.
- **Wave 123-125 Quantitative Desks**:
  - `src/desk/rubinstein/`: Rubinstein (1994) implied binomial tree calibration with no-arbitrage martingale projection.
  - `src/desk/lando/`: Lando (1998) continuous-time Markov rating transition engine with matrix exponential and par spread curve.
  - `src/desk/obizhaevawang/`: Obizhaeva-Wang (2013) optimal execution with transient impact and exponential resilience.
- **Wave 126-128 Quantitative Desks**:
  - `src/desk/carrmadan/`: Carr-Madan (1998) FFT and characteristic function option pricing engine with complex arithmetic and Simpson quadrature integration.
  - `src/desk/schonbucher/`: Schönbucher (2000) factor credit default model with log-normal intensity and tranche loss waterfall (Equity, Mezzanine, Senior).
  - `src/desk/hubermanstanzl/`: Huberman-Stanzl (2004) price manipulation and non-linear liquidity engine with quasi-arbitrage detection and optimal liquidation scheduling.
- **Wave 129-131 Quantitative Desks**:
  - `src/desk/hestonnandi/`: Heston-Nandi (2000) discrete-time GARCH option pricing engine with closed-form characteristic function inversion and Put-Call parity consistency.
  - `src/desk/davislo/`: Davis-Lo (2001) contagion credit default engine with continuous-time Markov infection cascade and tranche loss waterfalls.
  - `src/desk/alfonsi/`: Alfonsi-Fruth-Schied (2010) non-linear limit order book execution engine with power-law book shape, exponential resilience decay, and U-shaped optimal execution scheduling.
- **Wave 132-134 Quantitative Desks**:
  - `src/desk/margrabe/`: Margrabe (1978) dual-asset exchange option engine with composite volatility, analytical dual Greeks, and exchange Put-Call symmetry verification.
  - `src/desk/jarrowyu/`: Jarrow-Yu (2001) counterparty risk and asymmetric default contagion engine with primary-secondary jump intensity and vulnerable CDS spread pricing.
  - `src/desk/gatheral/`: Gatheral (2010) no-dynamic-arbitrage transient price impact engine with exponential/power-law decay kernels and round-trip price manipulation testing.
- **Wave 135-137 Quantitative Desks**:
  - `src/desk/goldmansosin/`: Goldman-Sosin-Gatto (1979) path-dependent lookback option engine with floating/fixed strike analytical pricing, continuous cost-of-carry singularity handling ($b \to 0$), and running extrema sensitivities.
  - `src/desk/collindufresne/`: Collin-Dufresne & Goldstein (2001) stationary leverage structural credit engine with mean-reverting debt dynamics, stationary variance floors, and non-zero short-term spread curves.
  - `src/desk/bouchaud/`: Bouchaud-Gefen-Potters-Wyart (2004) empirical power-law order flow impact engine with long-memory sign autocorrelation, bare propagator decay, and market efficiency cancellation verification ($\beta = \frac{1 - \gamma}{2}$).
- **Wave 138-140 Quantitative Desks**:
  - `src/desk/asian/`: Kemna-Vorst (1990) & Turnbull-Wakeman (1991) geometric and arithmetic Asian option engine with moment matching, AM-GM convexity verification, and dual Greeks.
  - `src/desk/lelandtoft/`: Leland-Toft (1996) optimal capital structure credit engine with endogenous bankruptcy boundary ($V_B$), tax shields, bankruptcy friction, and smooth pasting equity valuation.
  - `src/desk/madhavan/`: Madhavan-Richardson-Roomans (1997) econometric microstructure engine with trade flow autocorrelation, OLS structural regression, and spread decomposition into adverse selection vs order processing components.
- **Wave 141-143 Quantitative Desks**:
  - `src/desk/mertonjump/`: Merton (1976) Poisson jump-diffusion option pricing engine with analytical series expansion, Put-Call parity consistency, and finite-difference Greeks.
  - `src/desk/longstaffschwartz/`: Longstaff-Schwartz (1995) two-factor interest rate & credit risk engine with Vasicek short rate coupling, bivariate first-passage default barrier, and credit spread term structures.
  - `src/desk/glostenmilgrom/`: Glosten-Milgrom (1985) sequential trade microstructure engine with informed trader adverse selection fraction, Bayesian belief recursion, and dynamic Bid/Ask quote spread paths.
- **Wave 144-146 Quantitative Desks**:
  - `src/desk/quadraticamerican/`: Barone-Adesi & Whaley (1987) quadratic approximation American option engine with Newton-Raphson smooth pasting critical boundary solver and Greeks.
  - `src/desk/duffiekan/`: Duffie-Kan (1996) multi-factor affine term structure rate & default intensity credit spread engine with matrix Riccati ODE solutions.
  - `src/desk/ekop/`: Easley-Kiefer-O'Hara-Paperman (1996) structural microstructure engine with Poisson mixture order flow likelihood, analytical PIN calculation, and Bayesian event classification.
- **Wave 147-149 Quantitative Desks**:
  - `src/desk/hestonchf/`: Heston (1993) semi-analytical characteristic function stochastic volatility engine with Albrecher Little-Trap formulation, numerical quadrature, and Put-Call parity.
  - `src/desk/circredit/`: Cox-Ingersoll-Ross (1985) multi-factor square-root diffusion term structure & credit engine with analytical bond coefficients and survival probability.
  - `src/desk/hasbrouckvar/`: Hasbrouck (1991) Vector Autoregressive (VAR) microstructure engine with empirical impulse response, permanent price impact, and information share variance decomposition.
- **Wave 150-152 Quantitative Desks**:
  - `src/desk/cranknicolson/`: Crank-Nicolson (1947) finite difference American option pricing engine with Brennan-Schwartz projected early exercise dynamic programming and finite difference Greeks.
  - `src/desk/nelsoncurve/`: Nelson-Siegel-Svensson continuous credit & yield curve engine with zero rates, instantaneous forwards, discount factors, and credit hazard spread curves.
  - `src/desk/rollspread/`: Roll (1984) effective bid-ask spread microstructure engine with first-order serial autocovariance estimation and bid-ask bounce variance decomposition.
- **Wave 153-155 Quantitative Desks**:
  - `src/desk/cev/`: Cox (1975) Constant Elasticity of Variance (CEV) option engine with Poisson-gamma mixture / Sankaran non-central chi-square CDF expansion, Black-Scholes boundary convergence, and finite difference Greeks.
  - `src/desk/jltcredit/`: Jarrow-Lando-Turnbull (1997) Markov rating transition credit engine with risk-neutral default generator scaling, defaultable bond valuation, and multi-tier credit spread curves.
  - `src/desk/pastorstambaugh/`: Pástor-Stambaugh (2003) liquidity risk engine with signed dollar volume reversal regressions, AR(1) systematic liquidity innovation extraction, and asset liquidity beta estimation.
- **Wave 156-158 Quantitative Desks**:
  - `src/desk/mertondividend/`: Merton (1973) continuous dividend Black-Scholes option pricing engine with closed-form European calls/puts, analytical Greeks, and Put-Call parity verification.
  - `src/desk/distance2default/`: Merton (1974) structural credit risk and distance-to-default engine with nonlinear bivariate iterative solver recovering unobservable asset value $V$ and asset volatility $\sigma_V$, physical default probability, and structural CDS spreads.
  - `src/desk/kyleauction/`: Kyle (1985) continuous auction microstructure engine with equilibrium price impact $\lambda$, informed aggressiveness $\beta$, Bayesian variance revelation, and multi-stage sequential trading dynamics.
- **Wave 159-161 Quantitative Desks**:
  - `src/desk/bjerksund93/`: Bjerksund-Stensland (1993) American option pricing engine with analytical closed-form approximation, endogenous exercise trigger boundaries, and Put-Call symmetry transformation.
  - `src/desk/vasicekrate/`: Vasicek (1977) Gaussian short-rate term structure engine with Ornstein-Uhlenbeck mean-reverting dynamics, affine zero-coupon bond pricing, instantaneous forward rates, and asymptotic yield calculations.
  - `src/desk/huangstoll/`: Huang-Stoll (1997) microstructure spread decomposition engine with bivariate OLS econometric regression, trade persistence Markov modeling, and decomposition into adverse selection, order processing, and inventory holding components.
- **Wave 162-164 Quantitative Desks**:
  - `src/desk/black76/`: Black (1976) European futures and forward option engine with zero-drift cost-of-carry lognormal diffusion, closed-form calls/puts, full analytical Greeks, and futures Put-Call parity.
  - `src/desk/jamshidian/`: Jamshidian (1989) swaption and coupon bond option engine with exact decomposition into a portfolio of zero-coupon bond options, one-factor Vasicek short-rate term structure, and numerical critical rate ($r^*$) bisection solver.
  - `src/desk/gkn/`: George-Kaul-Nimalendran (1991) market microstructure spread decomposition engine purging bid-ask bounce via quote midpoint revisions and estimating adverse selection and order processing shares.
- **Wave 165-167 Quantitative Desks**:
  - `src/desk/kirkspread/`: Kirk (1995) two-asset spread option engine with modified forward volatility, analytical calls/puts, full Greeks, and Margrabe boundary verification.
  - `src/desk/chenrate/`: Chen (1996) three-factor stochastic volatility short rate engine with central tendency and volatility mean-reversions, expectation trajectories, and term structure bond pricing.
  - `src/desk/lsb/`: Lin-Sanger-Booth (1995) spread decomposition engine with empirical quote revision regressions and three-way decomposition into adverse selection, order processing, and inventory holding shares.
- **Wave 168-170 Quantitative Desks**:
  - `src/desk/rubinstein83/`: Rubinstein (1983) displaced diffusion option pricing engine with asset debt-displacement parameter $\alpha$, effective strike transformation, and analytical Greeks.
  - `src/desk/holee/`: Ho-Lee (1986) arbitrage-free Gaussian term structure engine with analytical zero-coupon bond pricing and bond option valuation.
  - `src/desk/madhavansmidt/`: Madhavan-Smidt (1991) specialist inventory and Bayesian learning microstructure engine with signed volume price updates and inventory quote shading.

### 2. Billing & Subscription Gateway (`src/billing/`, `src/platform/billing/`)
- **NOWPayments Webhook Verification**: Recursive key sorting (`ksort`) for HMAC-SHA512 validation with timing-safe comparison (`crypto.timingSafeEqual` and `constantTimeEqual`).
- **Tier Activation**: Auto-provisions subscriber quotas (`BASIC`, `PREMIUM`, `ENTERPRISE`, `MASTER`).
- **Proactive Invalidation**: Downgrades (`refunded`, `failed`, `expired`) trigger immediate Cloudflare KV eviction (`tier:${tenantId}`), eliminating stale authorization windows.

### 3. Edge Notifications & Email Provider (`src/platform/notifications/`)
- Zero-dependency edge email delivery via `resend-email-provider.ts` utilizing native `fetch`.
- Compatible with Cloudflare Workers runtime and Node.js.
- Automated token sanitization and rate-limit backoff handling.

### 4. Customer Onboarding State Machine (`src/platform/billing/onboarding-service.ts`)
- 3-step activation workflow: `signup` (validation + 6-digit OTP) -> `verify` (code + TTL match) -> `activate` (cryptographic license generation).
- PostgreSQL storage with drip sequence enrollment.

---

## Quality Ratchet & CI Gates

Algo Trader enforces Quality Ratchet v1.1.0 across 12 automated gates:
1. **Test Suite**: 100% pass rate across all unit & integration test files.
2. **Line Coverage**: $\ge 95.00\%$.
3. **Function Coverage**: $\ge 93.00\%$.
4. **Branch Coverage**: $\ge 86.00\%$.
5. **Statement Coverage**: $\ge 94.00\%$.
6. **Strict Types**: 0 `:any` types in TypeScript.
7. **Console Sanitation**: $\le 2$ non-logger console calls.
8. **File Size Boundary**: 0 oversized files ($>200$ LOC in `src/`).
9. **Import Quarantine**: 0 banned legacy imports.
10. **ESLint Baseline**: 0 new ESLint suppressions.
11. **Typecheck Gate**: `tsc --noEmit` exit 0.
12. **Build Gate**: `npm run build` exit 0.

---

## Quick Reference Commands

```bash
# Typecheck
npm run typecheck

# Run unit tests
npm test

# Run quality ratchet verification
node scripts/check-quality-baseline.mjs --quality

# Build platform
npm run build
```

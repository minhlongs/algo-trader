# Tech Stack & Architecture: Wave 193–195 Quantitative Triad

**Architecture Tier:** Apex Quantitative Models & Execution Engine (algo-trader)
**Standard:** Strict Quality Ratchet (< 180 LOC / file, 0 `:any`, 0 `console.log`, 100% Green Vitest)

---

## 1. Quantitative Models Architecture

### Wave 193: Dupire (1994) Continuous Local Volatility Surface
- **Module:** `src/desk/dupire/`
- **Files:**
  - `dupire-types.ts`: Interface definitions for strike/maturity grid, local variance matrix $\sigma_{\text{loc}}^2(K, T)$, surface derivatives, and calibration metrics.
  - `dupire-math.ts`: Numerical differentiation for call price derivatives ($\partial_T C, \partial_K C, \partial_K^2 C$), total implied variance $w(y, T)$ conversion, calendar spread monotonicity check ($\partial_T w \ge 0$), and butterfly non-arbitrage bounds.
  - `dupire-calibrator.ts`: Bi-cubic spline & SVI surface smoother to stabilize derivative calculations against noisy option quotes.
  - `dupire-engine.ts`: `DupireLocalVolEngine` producing full local volatility surfaces, spot-dependent diffusion steps, and PDE pricing.
  - `index.ts`: Barrel exports.

### Wave 194: Bollerslev (1986) GARCH(1,1) & Glosten-Jagannathan-Runkle (1993) GJR-GARCH
- **Module:** `src/desk/garch/`
- **Files:**
  - `garch-types.ts`: GJR-GARCH parameters $(\omega, \alpha, \gamma, \beta)$, log-likelihood metrics, unconditional variance, half-life of volatility shocks, and multi-step forecast term structures.
  - `garch-math.ts`: Recursive conditional variance filter $\sigma_t^2 = \omega + (\alpha + \gamma \mathbf{1}_{\{\epsilon_{t-1} < 0\}})\epsilon_{t-1}^2 + \beta \sigma_{t-1}^2$, Gaussian QMLE log-likelihood calculation, and term structure forward projection.
  - `garch-estimator.ts`: Nelder-Mead / L-BFGS numerical optimizer with stationarity constraints ($\alpha + \beta + \gamma/2 < 1, \omega > 0, \alpha \ge 0, \beta \ge 0$).
  - `garch-engine.ts`: `GjrGarchEngine` providing rolling volatility estimation, asymmetry coefficient testing, and multi-horizon parametric VaR.
  - `index.ts`: Barrel exports.

### Wave 195: Biais-Hillion-Spatt (1995) Empirical LOB Microstructure
- **Module:** `src/desk/biais/`
- **Files:**
  - `biais-types.ts`: 11 discrete order book event categories (Market Buy/Sell, Limit at/inside/beyond quotes, Cancellations), order book snapshots, Markov transition probability matrices.
  - `biais-classifier.ts`: Event classifier matching sequential order book delta ticks into the canonical 11 BHS event categories.
  - `biais-math.ts`: Transition frequency counter, row-normalized Markov transition matrix $P_{ij}$, diagonal persistence clustering $\lambda_{ii} = P_{ii}/(1 - P_{ii})$, and conditional spread impact $\Delta S(E_t)$.
  - `biais-engine.ts`: `BiaisHillionSpattEngine` analyzing order flow autocorrelation, liquidity supply vs demand asymmetry, and adverse selection risk.
  - `index.ts`: Barrel exports.

---

## 2. Test Architecture & Coverage
- `tests/unit/desk/dupire/dupire.test.ts`: Zero-mock tests validating flat Black-Scholes surface recovery, smile curvature, and arbitrage rejection.
- `tests/unit/desk/garch/garch.test.ts`: Zero-mock tests validating GJR-GARCH asymmetric leverage response, unconditional variance convergence, and QMLE parameter recovery.
- `tests/unit/desk/biais/biais.test.ts`: Zero-mock tests validating 11-event classification, diagonal transition clustering, and spread widening on market order bursts.

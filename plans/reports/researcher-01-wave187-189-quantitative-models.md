# Researcher Report: Wave 187–189 Quantitative Models Suite

**Focus:** Carr-Wu (2004) FMLS, Epps (1979) Correlation Decay, Scholes-Williams (1977) Non-Synchronous Beta
**Target Directory:** `src/desk/{carrwu, eppseffect, scholeswilliams}/`
**Constraint:** Zero mock data, zero `:any` types, pure numerical precision, < 180 LOC per file.

---

## 1. Wave 187 — Carr-Wu (2004) Finite Moment Log-Stable (FMLS) Process

### Theoretical Background
Standard Black-Scholes geometric Brownian motion fails to capture heavy left tails and implied volatility skew in volatile markets. Carr & Wu (2004) introduced the Finite Moment Log-Stable (FMLS) model where log-asset dynamics are driven by an $\alpha$-stable Lévy motion with maximal negative asymmetry ($\beta = -1$):
$$dX_t = (r - q - \omega) dt + \sigma dL_t^{\alpha, -1}$$
where $\alpha \in (1, 2]$ is the stability index governing tail thickness ($\alpha=2$ recovers Black-Scholes), $\sigma > 0$ is the scale parameter, and $\omega$ is the convexity adjustment ensuring the discounted asset price $e^{-(r-q)t} S_t$ is a martingale:
$$\omega = -\frac{\sigma^\alpha}{\cos(\pi \alpha / 2)}$$

### Characteristic Function & Pricing
The log-characteristic function $\phi(u) = \mathbb{E}[e^{i u \ln(S_T/S_0)}]$ is given analytically:
$$\psi(u) = i u (r - q - \omega) T - \frac{T \sigma^\alpha}{\cos(\pi \alpha / 2)} (i u)^\alpha$$
Option pricing is computed via Gil-Pelaez inversion:
$$C(S_0, K, T) = S_0 e^{-q T} \Pi_1 - K e^{-r T} \Pi_2$$
$$\Pi_2 = \frac{1}{2} + \frac{1}{\pi} \int_0^\infty \text{Re}\left( \frac{\phi(u) e^{-i u \ln(K/S_0)}}{i u} \right) du$$
$$\Pi_1 = \frac{1}{2} + \frac{1}{\pi} \int_0^\infty \text{Re}\left( \frac{\phi(u - i) e^{-i u \ln(K/S_0)}}{i u \phi(-i)} \right) du$$

---

## 2. Wave 188 — Epps (1979) High-Frequency Asynchronous Correlation Decay

### Theoretical Background
Epps (1979) documented that the empirical cross-correlation between two liquid financial assets approaches zero as the return sampling frequency $\Delta t \to 0$, even when their macro correlation is high. This is caused by asynchronous transaction timestamps and discrete order arrivals.

### Mathematical Formulation
1. **Asynchronous Return Alignment (Refresh Time / Hansen-Lunde-Nason):**
   Given tick timestamps $\{t_i^A\}$ and $\{t_j^B\}$, the common synchronization grid $\tau_k = \max(t^A(k), t^B(k))$ aligns prices to the latest observable trade.
2. **Empirical Correlation Decay Function:**
   $$\rho(\Delta t) = \rho_\infty \left(1 - \exp\left(-\frac{\Delta t}{\tau_e}\right)\right)$$
   where $\rho_\infty$ is the asymptotic macroscopic correlation and $\tau_e$ is the characteristic Epps time scale.
3. **De-Biased Lead-Lag Cross-Correlation:**
   $$\rho_{A,B}(\ell) = \frac{\sum_k (r_{A, \tau_k} - \bar{r}_A)(r_{B, \tau_{k+\ell}} - \bar{r}_B)}{\sigma_A \sigma_B}$$
   Detects informational lead-lag dynamics between Binance/Coinbase fast feeds and Polymarket CLOB books.

---

## 3. Wave 188 — Scholes-Williams (1977) Non-Synchronous Trading Beta

### Theoretical Background
When assets trade infrequently or with asynchronous observation times (common in prediction markets and niche crypto tokens), ordinary least squares (OLS) regression underestimates market beta ($\beta_0 < \beta_{\text{true}}$) and induces spurious autocorrelation.

### Mathematical Formulation
Scholes and Williams (1977) derived a consistent, asymptotically unbiased estimator:
$$\beta^{SW} = \frac{\beta_{-1} + \beta_0 + \beta_{+1}}{1 + 2 \rho_m}$$
where:
- $\beta_k = \frac{\text{Cov}(R_{i, t}, R_{m, t+k})}{\text{Var}(R_{m, t})}$ is the lag-$k$ OLS slope coefficient for $k \in \{-1, 0, +1\}$.
- $\rho_m = \text{Corr}(R_{m, t}, R_{m, t-1})$ is the first-order serial autocorrelation of the market index returns.
- Standard error and $t$-statistic are adjusted for contemporaneous and cross-lag residual covariances.
- Asynchronous Price Discovery Score: $S_{PD} = \frac{\beta_{+1} - \beta_{-1}}{|\beta_0| + \epsilon}$. Positive values indicate asset prices lead the index; negative values indicate lagging.

---

## 4. Architectural Layout
- `src/desk/carrwu/`:
  - `carr-wu-types.ts`: Model parameters, pricing inputs, Greeks, calibration targets.
  - `carr-wu-math.ts`: Characteristic function, Gil-Pelaez quadrature, convexity adjustment $\omega$.
  - `carr-wu-engine.ts`: Pricing engine, Greeks calculation, IV smile evaluation.
  - `index.ts`: Unified barrel exports.
- `src/desk/eppseffect/`:
  - `epps-effect-types.ts`: Tick streams, correlation curves, lead-lag matrix types.
  - `epps-effect-math.ts`: Refresh-time synchronizer, Epps decay curve fitter, cross-correlation kernel.
  - `epps-effect-engine.ts`: High-frequency correlation synchronizer and lead-lag detector.
  - `index.ts`: Unified barrel exports.
- `src/desk/scholeswilliams/`:
  - `scholes-williams-types.ts`: Asset/market return series, lag betas, unbiased beta output.
  - `scholes-williams-math.ts`: Lagged covariances, autocorrelation adjustment, variance calculations.
  - `scholes-williams-engine.ts`: Non-synchronous beta estimation and price discovery ranker.
  - `index.ts`: Unified barrel exports.

## Unresolved Questions
None. Standard mathematical definitions and analytical formulas are fully established in the literature.

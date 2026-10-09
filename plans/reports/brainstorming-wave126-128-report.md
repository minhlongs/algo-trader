# Deep Quantitative Brainstorming: Wave 126–128 Desks

## 1. Executive Triad Selection

Following the canonical progression of quantitative finance literature and market microstructure desks:
- **Wave 120-122**: Garman-Kohlhagen (1983 FX Options), CreditGrades (2002 Structural Credit), Lehalle-Moallemi (2018 Lit/Dark Execution).
- **Wave 123-125**: Rubinstein (1994 Implied Binomial Tree), Lando (1998 Markov Rating Transitions), Obizhaeva-Wang (2013 Transient Market Impact).
- **Target Wave 126-128**:
  1. **Desk 126: Carr-Madan (1998) FFT Option Pricing & Characteristic Functions Engine**
     - Fast Fourier Transform (FFT) / Gauss-Legendre quadrature integration for call pricing across arbitrary Levy characteristic exponents $\phi_T(u)$.
     - Alpha dampening factor $\alpha > 0$ ensuring square-integrability of modified call price: $\psi_T(v) = \frac{e^{-r T} \phi_T(v - (\alpha + 1)i)}{\alpha^2 + \alpha - v^2 + i(2\alpha + 1)v}$.
     - Zero external FFT dependencies: high-precision numerical Simpson / trapezoidal quadrature inversion.
  2. **Desk 127: Schönbucher (2000) Dynamic Factor Credit Default Model**
     - Copula and dynamic hazard intensity default correlation model.
     - Correlated default times driven by market credit factor $M(t)$ and idiosyncratic Poisson jumps: $\lambda_i(t) = a_i M(t) + b_i$.
     - Homogeneous / heterogeneous pool basket default distribution, CDS tranche loss waterfalls, and conditional survival pricing: $Q_i(t \mid M) = \exp\left(-\int_0^t \lambda_i(s \mid M) ds\right)$.
  3. **Desk 128: Huberman-Stanzl (2004) Price Manipulation & Non-Linear Liquidity Engine**
     - Analysis of market impact functions $f(v)$ ensuring absence of price manipulation and quasi-arbitrage (round-trip profit).
     - Proves linear temporary and permanent impact $g(v) = \gamma v$ are the unique non-manipulable functional forms under time-homogeneous books.
     - Dynamic execution optimizer under multi-period price resilience, calculating execution costs and predatory manipulation bounds.

---

## 2. Desk 126: Carr-Madan (1998) FFT Option Pricing Specification

### Mathematical Model
Option price via Fourier inversion:
$$C(K) = \frac{e^{-\alpha k}}{\pi} \int_0^\infty e^{-i v k} \psi_T(v) dv$$
where $k = \ln(K)$ and:
$$\psi_T(v) = \frac{e^{-r T} \phi_T(v - (\alpha + 1)i)}{\alpha^2 + \alpha - v^2 + i(2\alpha + 1)v}$$
Supported characteristic functions:
- Black-Scholes: $\phi_{BS}(u) = \exp\left(i u (\ln(S_0) + (r - q - \frac{1}{2}\sigma^2)T) - \frac{1}{2}\sigma^2 u^2 T\right)$
- Heston: stochastic volatility characteristic function with complex logarithm branch cut stabilization.

### Interface & Deliverables
- `src/desk/carrmadan/carr-madan-types.ts`
- `src/desk/carrmadan/carr-madan-math.ts`
- `src/desk/carrmadan/carr-madan-engine.ts`
- `tests/unit/desk/carrmadan/carr-madan-suite.test.ts`

---

## 3. Desk 127: Schönbucher (2000) Factor Credit Default Specification

### Mathematical Model
Single/multi-factor credit intensity:
$$\lambda_i(t \mid X) = \lambda_0 \cdot \exp\left(\beta_i X - \frac{1}{2}\beta_i^2\right)$$
where $X \sim \mathcal{N}(0, 1)$ represents systemic macroeconomic state.
- Conditional survival: $Q_i(t \mid X) = \exp\left(-\lambda_i(t \mid X) t\right)$.
- Portfolio loss distribution: $L(t) = \sum_{i=1}^M c_i \cdot \mathbf{1}_{\{\tau_i \le t\}}$.
- Tranche pricing: Expected loss $\mathbb{E}[(L(t) - K_1)^+ - (L(t) - K_2)^+]$.

### Interface & Deliverables
- `src/desk/schonbucher/schonbucher-types.ts`
- `src/desk/schonbucher/schonbucher-math.ts`
- `src/desk/schonbucher/schonbucher-engine.ts`
- `tests/unit/desk/schonbucher/schonbucher-suite.test.ts`

---

## 4. Desk 128: Huberman-Stanzl (2004) Price Manipulation Engine

### Mathematical Model
Price dynamics with permanent and temporary impact:
$$P_t = P_0 + \sum_{s=1}^t \gamma \cdot x_s + \eta(x_t)$$
No-price-manipulation condition requires symmetric positive semi-definite impact cross-effects:
$$M_{ij} = \frac{\partial P_i}{\partial x_j}$$
Round-trip execution cost:
$$C(x) = \sum_{t=0}^T x_t \left(P_0 + \gamma \sum_{s=0}^t x_s + \theta x_t\right)$$
Ensures cost $C(x) \ge 0$ for all round-trip strategies $\sum x_t = 0$.

### Interface & Deliverables
- `src/desk/hubermanstanzl/huberman-stanzl-types.ts`
- `src/desk/hubermanstanzl/huberman-stanzl-math.ts`
- `src/desk/hubermanstanzl/huberman-stanzl-engine.ts`
- `tests/unit/desk/hubermanstanzl/huberman-stanzl-suite.test.ts`

---

## 5. Architectural & Quality Constraints
- Zero runtime dependencies.
- Native TypeScript math algorithms.
- Every file strictly $\le 200$ LOC.
- Zero `:any` types.
- 100% zero-mock unit test coverage.

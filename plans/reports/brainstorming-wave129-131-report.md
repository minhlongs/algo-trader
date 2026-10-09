# Brainstorming Report: Wave 129–131 Quantitative Trading Desks

## Executive Summary
Wave 129–131 implements three quantitative engines across derivatives econometrics, systemic credit contagion, and non-linear market microstructure:
1. **Desk 129: Heston-Nandi (2000) GARCH Option Pricing Engine** — Discrete-time affine GARCH(1,1) model with closed-form characteristic function inversion for European option pricing without continuous-time diffusion limits.
2. **Desk 130: Davis-Lo (2001) Contagion Credit Default Engine** — Continuous-time Markov infection and domino default risk model with systemic cascade probabilities and tranche loss waterfalls.
3. **Desk 131: Alfonsi-Fruth-Schied (2010) Non-Linear Order Book Execution Engine** — Optimal liquidation in limit order books with non-linear shape functions $D(x) = \alpha x^\delta$ and exponential resilience decay.

---

## Desk 129: Heston-Nandi (2000) GARCH Option Pricing
### 1. Dynamics Under Physical ($\mathbb{P}$) & Risk-Neutral ($\mathbb{Q}$)
Log-return and conditional variance evolve as:
$$\ln(S_{t+1}/S_t) = r + \lambda h_{t+1} + \sqrt{h_{t+1}} z_{t+1}$$
$$h_{t+1} = \omega + \beta h_t + \alpha (z_t - \gamma \sqrt{h_t})^2$$
Under risk-neutral measure $\mathbb{Q}$, $z_t^* = z_t + (\lambda + 0.5)\sqrt{h_t} \sim \mathcal{N}(0, 1)$:
$$\ln(S_{t+1}/S_t) = r - \frac{1}{2}h_{t+1} + \sqrt{h_{t+1}} z_{t+1}^*$$
$$h_{t+1} = \omega + \beta h_t + \alpha (z_t^* - \gamma^* \sqrt{h_t})^2, \quad \gamma^* = \gamma + \lambda + 0.5$$

### 2. Characteristic Function & Fourier Inversion
Log-price generating function $f(\phi) = \mathbb{E}^{\mathbb{Q}}[S_T^\phi \mid \mathcal{F}_t] = S_t^\phi \exp(A_t + B_t h_{t+1})$ solved recursively backwards from terminal condition $A_T = 0, B_T = 0$:
$$A_t = A_{t+1} + \phi r + B_{t+1} \omega - \frac{1}{2} \ln(1 - 2\alpha B_{t+1})$$
$$B_t = \phi (\lambda + 0.5) - \frac{1}{2}(\lambda + 0.5)^2 + \beta B_{t+1} + \frac{1/2 (\phi - (\lambda + 0.5) + 2\alpha B_{t+1}\gamma^*)^2}{1 - 2\alpha B_{t+1}} - \frac{1}{2}(\gamma^*)^2$$
Option price via Fourier probabilities:
$$C = S_t P_1 - K e^{-r (T-t)} P_2$$
where $P_1, P_2$ are inverted via composite Simpson quadrature over $[0, 100]$.

---

## Desk 130: Davis-Lo (2001) Contagion Credit Default Engine
### 1. Contagion Birth Process
A basket of $n$ obligors experiences:
- Autonomous default intensity $\lambda_0$
- Systemic infection/contagion: each existing default adds contagion hazard $\mu$, so total jump rate from $k$ defaults to $k+1$ is:
$$\lambda_k = (n - k)(\lambda_0 + k \mu)$$
- Transition probability matrix $\mathbf{P}(t) = \exp(\mathbf{Q}t)$ or recursive differential forward equations:
$$\frac{d p_k(t)}{dt} = -\lambda_k p_k(t) + \lambda_{k-1} p_{k-1}(t)$$
with boundary condition $p_0(0) = 1, p_k(0) = 0$ for $k > 0$.
### 2. Tranche Losses & Credit Spreads
Tranche loss distributions, expected default counts, and senior/mezzanine/equity credit protection legs are evaluated directly from the discrete distribution $\{p_k(t)\}_{k=0}^n$.

---

## Desk 131: Alfonsi-Fruth-Schied (2010) Non-Linear Order Book Execution
### 1. Non-Linear LOB Shape & Price Impact
Order book density $D(E) = \alpha E^\delta$ ($\delta = 0$ flat book, $\delta = 1$ linear density / quadratic impact).
Extra mid-price displacement after block order $x$:
$$E_{new} = \left( E^\delta + \frac{\delta + 1}{\alpha} x \right)^{\frac{1}{\delta + 1}}$$
Resilience: between trades, displacement decays at exponential rate $\rho$: $E(t^+) = E(t^-) e^{-\rho \Delta t}$.
### 2. Multi-Period Liquidation & Shortfall
Evaluates total execution cost, average execution price, and comparison against benchmark linear TWAP execution.

---

## Architecture & Quality Constraints
- Modular architecture with strict separation between `types.ts`, `math.ts`, and `engine.ts`.
- Maximum 200 lines of code per file (target $\le 150$ LOC).
- Zero external runtime numerical packages (pure TypeScript mathematics).
- Zero `:any` types.
- 100% zero-mock unit test coverage in Vitest.

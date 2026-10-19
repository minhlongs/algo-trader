# Brainstorming Report — Wave 135-137 Quantitative Desks

## Executive Summary

Wave 135-137 establishes an elite quantitative triad spanning path-dependent extrema pricing, stationary-leverage structural credit, and long-memory market impact:
1. **Desk 135: Goldman-Sosin-Gatto (1979) Lookback Option Pricing Engine** (`src/desk/goldmansosin/`)
2. **Desk 136: Collin-Dufresne & Goldstein (2001) Stationary Leverage Structural Credit Engine** (`src/desk/collindufresne/`)
3. **Desk 137: Bouchaud-Gefen-Potters-Wyart (2004) Empirical Power-Law Order Flow Impact Engine** (`src/desk/bouchaud/`)

---

## 1. Desk 135: Goldman-Sosin-Gatto (1979) Lookback Option Engine

### Quantitative Foundation
- Path-dependent running extrema on underlying geometric Brownian motion:
  - Running minimum $m_t = \min_{0 \le u \le t} S_u$, running maximum $M_t = \max_{0 \le u \le t} S_u$.
- Floating-strike lookback payoffs:
  - Call payoff: $S_T - m_T$ (buy at lowest price, sell at terminal spot).
  - Put payoff: $M_T - S_T$ (sell at highest price, buy at terminal spot).
- Closed-form analytical valuation with continuous dividend yield $q$ and cost of carry $b = r - q$:
  $$a_1 = \frac{\ln(S/m) + (b + \frac{1}{2}\sigma^2)\tau}{\sigma\sqrt{\tau}}, \quad a_2 = a_1 - \sigma\sqrt{\tau}$$
  $$C_{fl} = S e^{-q\tau} \mathcal{N}(a_1) - m e^{-r\tau} \mathcal{N}(a_2) + S e^{-r\tau} \frac{\sigma^2}{2b}\left[\left(\frac{S}{m}\right)^{-2b/\sigma^2} \mathcal{N}\left(-a_1 + \frac{2b}{\sigma}\sqrt{\tau}\right) - e^{b\tau}\mathcal{N}(-a_1)\right]$$
  $$b_1 = \frac{\ln(S/M) + (b + \frac{1}{2}\sigma^2)\tau}{\sigma\sqrt{\tau}}, \quad b_2 = b_1 - \sigma\sqrt{\tau}$$
  $$P_{fl} = M e^{-r\tau} \mathcal{N}(-b_2) - S e^{-q\tau} \mathcal{N}(-b_1) + S e^{-r\tau} \frac{\sigma^2}{2b}\left[-\left(\frac{S}{M}\right)^{-2b/\sigma^2} \mathcal{N}\left(b_1 - \frac{2b}{\sigma}\sqrt{\tau}\right) + e^{b\tau}\mathcal{N}(b_1)\right]$$
- Singular boundary condition handling as $b \to 0$ ($r = q$) via continuous limit.
- Analytical Greeks: $\Delta, \Gamma, \mathcal{V}, \Theta$, plus extrema sensitivities $\partial C / \partial m$, $\partial P / \partial M$.

---

## 2. Desk 136: Collin-Dufresne & Goldstein (2001) Structural Credit Engine

### Quantitative Foundation
- Resolves Merton (1974) credit spread puzzle where investment-grade spreads unrealistically collapse to zero at short horizons.
- Log-leverage ratio $y_t \equiv \ln(F(t)/V(t))$ mean-reverts toward stationary target $\bar{y}$ at adjustment speed $\lambda$:
  $$d y_t = \lambda (\bar{y} - y_t) dt - \sigma_V dW_t^V$$
- Stationary distribution preserves long-run variance $\sigma_V^2 / (2\lambda)$, generating strictly positive short-term spreads.
- First passage time default probability $\text{PD}(T)$ to distress boundary $y_B = 0$.
- Term structure of credit spreads:
  $$s(T) \approx -\frac{1}{T} \ln\left(1 - (1 - R)\text{PD}(T)\right)$$
  - High initial leverage ($y_0 > \bar{y}$): downward-sloping curve.
  - Target leverage ($y_0 \approx \bar{y}$): humped/flat curve.
  - High quality / low leverage ($y_0 < \bar{y}$): upward-sloping curve with non-zero short-term floor.

---

## 3. Desk 137: Bouchaud-Gefen-Potters-Wyart (2004) Microstructure Impact Engine

### Quantitative Foundation
- Market order sign sequence $\epsilon_n \in \{-1, +1\}$ exhibits long-memory power-law auto-correlation:
  $$C(l) = \langle \epsilon_n \epsilon_{n+l} \rangle \approx C_0 (1 + l)^{-\gamma}, \quad 0 < \gamma < 1$$
- Price impact is mediated by bare propagator kernel $G_0(l) = \Gamma_0 (1 + l)^{-\beta}$.
- Dressed response function:
  $$R(l) = \langle (p_{n+l} - p_n)\epsilon_n \rangle = G_0(l) + \sum_{j=1}^l G_0(l-j) C(j)$$
- Bouchaud Exact Cancellation Theorem:
  - Market efficiency and martingale prices require:
    $$\beta = \frac{1 - \gamma}{2}$$
  - $\beta > (1-\gamma)/2 \implies$ impact decays too fast; price mean-reverts (reversal arbitrage).
  - $\beta < (1-\gamma)/2 \implies$ impact persists too long; price trends (momentum arbitrage).
  - $\beta = (1-\gamma)/2 \implies$ flat dressed response plateau, zero serial return correlation.

---

## Technical Constraints & CI Ratchet
- Strict $\le 150$ LOC per file across all `.ts` files.
- Zero `:any` types.
- Pure TypeScript mathematics (no external dependencies).
- 100% zero-mock unit test coverage with Vitest.

---

## Unresolved Questions
- None. Mathematical models, closed-form formulas, and test benchmarks fully established.

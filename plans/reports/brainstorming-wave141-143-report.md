# Brainstorming Report: Wave 141-143 Quantitative Desks

## 1. Desk 141: Merton (1976) Jump-Diffusion Option Pricing Engine
- **Mathematical Formulation**:
  $$S_t = S_0 \exp\left(\left(r - q - \lambda \kappa - \frac{1}{2}\sigma^2\right)t + \sigma W_t + \sum_{i=1}^{N_t} Y_i\right)$$
  - Compound Poisson jump process with intensity $\lambda$, log-normal jump size $Y_i \sim \mathcal{N}(\mu_J, \sigma_J^2)$.
  - Expected jump size $\kappa = \mathbb{E}[e^Y - 1] = \exp(\mu_J + \frac{1}{2}\sigma_J^2) - 1$.
  - Analytical Poisson series expansion:
    $$C(S, K, T) = \sum_{n=0}^{N_{max}} \frac{e^{-\lambda' T} (\lambda' T)^n}{n!} C_{BS}(S, K, T, \sigma_n, r_n)$$
    where $\lambda' = \lambda(1 + \kappa)$, $\sigma_n^2 = \sigma^2 + \frac{n \sigma_J^2}{T}$, $r_n = r - \lambda \kappa + \frac{n \ln(1+\kappa)}{T}$.
  - Put-Call parity consistency: $C - P = S e^{-q T} - K e^{-r T}$.
  - Adaptive series truncation when cumulative Poisson weight satisfies $\sum \frac{(\lambda' T)^n e^{-\lambda' T}}{n!} > 1 - 10^{-12}$.

## 2. Desk 142: Longstaff-Schwartz (1995) Two-Factor Defaultable Bond & Term Structure Credit Engine
- **Mathematical Formulation**:
  - Two coupled state variables: short rate $r_t$ (Vasicek mean-reverting process) and firm asset value $V_t$ with correlation $\rho = \operatorname{Corr}(dW_r, dW_V)$.
  - Default boundary $V_B$: default occurs at first passage time $\tau = \inf\{t : V_t \le V_B\}$.
  - Default write-down severity $w$ upon hitting barrier $V_B$.
  - Closed-form defaultable discount bond:
    $$P(V, r, T) = p(r, T) - w \cdot \Pi(V, r, T)$$
    where $p(r, T)$ is riskless Vasicek zero-coupon bond, and $\Pi(V, r, T)$ is the present value of $1 paid at default.
  - Closed-form credit spread: $s(T) = -\frac{1}{T} \ln(P(V, r, T)) - y_{rf}(T)$.
  - Produces upward-sloping, humped, or inverted credit curves depending on leverage $V/V_B$ and rate-asset correlation $\rho$.

## 3. Desk 143: Glosten-Milgrom (1985) Information Asymmetry & Sequential Trade Microstructure Engine
- **Mathematical Formulation**:
  - Liquidation value $V \in \{V_L, V_H\}$, prior belief $p_t = \mathbb{P}(V = V_H)$.
  - Informed trader proportion $\alpha$, noise trader buy probability $\gamma$ and sell probability $1 - \gamma$.
  - Order arrival conditional probabilities:
    - $\mathbb{P}(Buy \mid V_H) = \alpha + (1-\alpha)\gamma$, $\mathbb{P}(Buy \mid V_L) = (1-\alpha)\gamma$.
    - $\mathbb{P}(Sell \mid V_H) = (1-\alpha)(1-\gamma)$, $\mathbb{P}(Sell \mid V_L) = \alpha + (1-\alpha)(1-\gamma)$.
  - Bayesian updating quotes:
    - Ask quote $A_t = \mathbb{E}[V \mid Buy_t] = V_L + (V_H - V_L) \cdot p_{t+1}(Buy)$.
    - Bid quote $B_t = \mathbb{E}[V \mid Sell_t] = V_L + (V_H - V_L) \cdot p_{t+1}(Sell)$.
    - Bid-Ask spread $S_t = A_t - B_t = (V_H - V_L)(p_{t+1}(Buy) - p_{t+1}(Sell))$.
  - Martingale property: $\mathbb{E}[p_{t+1} \mid p_t] = p_t$, and almost-sure convergence to true asset state under sequential trade flow.

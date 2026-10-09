# Brainstorming Report: Wave 144-146 Quantitative Desks

## 1. Desk 144: Barone-Adesi & Whaley (1987) Quadratic Approximation American Option Engine
- **Mathematical Formulation**:
  - American option value $V_A(S, K, T)$ decomposed into European component $V_E(S, K, T)$ plus early exercise premium $\epsilon(S, T)$:
    $$C_A(S) = \begin{cases} C_E(S) + A_2 (S / S^*)^{q_2}, & S < S^* \\ S - K, & S \ge S^* \end{cases}$$
    $$P_A(S) = \begin{cases} P_E(S) + A_1 (S / S^{**})^{q_1}, & S > S^{**} \\ K - S, & S \le S^{**} \end{cases}$$
  - Exponents $q_1, q_2$:
    $$q_2 = \frac{-(N-1) + \sqrt{(N-1)^2 + 4M/K_T}}{2}, \quad q_1 = \frac{-(N-1) - \sqrt{(N-1)^2 + 4M/K_T}}{2}$$
    where $N = 2b/\sigma^2$, $M = 2r/\sigma^2$, $K_T = 1 - e^{-rT}$.
  - Critical boundaries $S^*, S^{**}$ solved via Newton-Raphson smooth pasting:
    $$S^* - K = C_E(S^*) + \frac{1 - e^{-qT} N(d_1(S^*))}{q_2} S^*$$
    $$K - S^{**} = P_E(S^{**}) - \frac{1 - e^{-qT} N(-d_1(S^{**}))}{q_1} S^{**}$$
  - Greeks: American Delta, Gamma, Vega, Theta, Rho calculated analytically or via finite differences.

## 2. Desk 145: Duffie-Kan (1996) Affine Term Structure Rate & Credit Spread Engine
- **Mathematical Formulation**:
  - Vector of state variables $X_t \in \mathbb{R}^n$ following affine diffusion:
    $$dX_t = K(\theta - X_t) dt + \Sigma \sqrt{V(X_t)} dW_t$$
  - Short rate $r(X_t) = \delta_0 + \delta_1^T X_t$, default intensity $\lambda(X_t) = \lambda_0 + \lambda_1^T X_t$.
  - Zero-coupon bond price: $P(t, T) = \exp\left(A(\tau) + B(\tau)^T X_t\right)$ where $\tau = T - t$.
  - Riccati system of ordinary differential equations for coefficients $A(\tau)$ and $B(\tau)$:
    $$\frac{dB(\tau)}{d\tau} = -K^T B(\tau) + \frac{1}{2} B(\tau)^T \Sigma \Sigma^T B(\tau) - \delta_1, \quad B(0) = 0$$
    $$\frac{dA(\tau)}{d\tau} = K \theta^T B(\tau) - \delta_0, \quad A(0) = 0$$
  - Joint credit spread: $s(\tau) = -\frac{1}{\tau} \ln P_{defaultable}(\tau) - y_{riskless}(\tau)$.

## 3. Desk 146: Easley-Kiefer-O'Hara-Paperman (1996) Structural Microstructure Engine (EKOP)
- **Mathematical Formulation**:
  - Daily information event arrival with probability $\alpha$.
  - If event occurs, bad news with probability $\delta$, good news with probability $1 - \delta$.
  - Informed order flow Poisson rate $\mu$; uninformed buy/sell Poisson rate $\epsilon$.
  - Likelihood of daily trade counts $(B, S)$:
    $$\mathcal{L}(B, S \mid \Theta) = (1-\alpha) e^{-2\epsilon} \frac{\epsilon^{B+S}}{B! S!} + \alpha \delta e^{-(2\epsilon+\mu)} \frac{\epsilon^B (\epsilon+\mu)^S}{B! S!} + \alpha (1-\delta) e^{-(2\epsilon+\mu)} \frac{(\epsilon+\mu)^B \epsilon^S}{B! S!}$$
  - Probability of Information-based Trading (PIN):
    $$\text{PIN} = \frac{\alpha \mu}{\alpha \mu + 2\epsilon}$$
  - Bid-Ask spread dynamics: $S = \text{PIN} \cdot (V_H - V_L) + 2 \cdot \text{inventory friction}$.

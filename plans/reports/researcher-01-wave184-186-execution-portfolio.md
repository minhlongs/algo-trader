# Quantitative Execution & Portfolio Choice Research: Wave 184-186

## 1. Bertsimas-Lo (1998) Dynamic Optimal Execution Engine
Dimitris Bertsimas & Andrew W. Lo (1998), "Optimal Control of Execution Costs", *Journal of Financial Markets*.

### Mathematical Formulation
Execution of $S$ total units over $T$ discrete periods ($k = 1, \dots, T$) minimizing expected execution cost:
$$\min_{\{S_k\}_{k=1}^T} \mathbb{E}\left[ \sum_{k=1}^T S_k \tilde{P}_k \right] \quad \text{s.t.} \quad \sum_{k=1}^T S_k = S$$

#### Price Dynamics with Information State Variable
- Permanent price impact: $P_k = P_{k-1} + \theta S_k + \gamma X_k + \eta_k$
- Temporary price impact: $\tilde{P}_k = P_k + c S_k$
- Information state variable (e.g. order flow momentum): $X_k = \rho X_{k-1} + \xi_k, \quad |\rho| < 1$

#### Dynamic Programming Solution
Value function for remaining shares $W_k$ and information state $X_k$:
$$V_k(W_k, X_k) = \min_{S_k} \mathbb{E}\left[ S_k(P_k + c S_k) + V_{k+1}(W_k - S_k, X_{k+1}) \right]$$
In the absence of information ($X_k = 0$), optimal trajectory is deterministic:
$$S_k^* = \frac{W_k}{T - k + 1} = \frac{S}{T} \quad (\text{Linear TWAP})$$
With information state $X_k$:
$$S_k^* = \frac{W_k}{T - k + 1} + h_k X_k$$
where $h_k$ opportunistically accelerates or delays execution based on price drift.

## 2. Merton (1971) Continuous-Time Optimal Portfolio & Consumption Engine
Robert C. Merton (1971), "Optimum Consumption and Portfolio Rules in a Continuous-Time Model", *Journal of Economic Theory*.

### Mathematical Formulation
Continuous wealth dynamics:
$$dW_t = \left[ (r + \pi_t(\mu - r))W_t - c_t \right] dt + \pi_t \sigma W_t dB_t$$

#### CRRA Utility Objective
$$\max_{\{\pi_t, c_t\}} \mathbb{E}\left[ \int_0^T e^{-\rho t} \frac{c_t^{1-\gamma}}{1-\gamma} dt + \epsilon e^{-\rho T} \frac{W_T^{1-\gamma}}{1-\gamma} \right], \quad \gamma > 0, \gamma \neq 1$$

#### Closed-Form Optimal Solutions
1. **Optimal Asset Allocation (Merton Fraction)**:
   $$\pi^* = \frac{\mu - r}{\gamma \sigma^2}$$
   Independent of time $t$ and wealth $W_t$ (constant proportion).

2. **Optimal Consumption Propensity**:
   $$c^*(t, W_t) = \nu(t) W_t$$
   where $\nu(t) = \frac{\nu_0}{1 + (\nu_0 \epsilon^{1/\gamma} - 1) e^{-\nu_0 (T-t)}}$, and $\nu_0 = \frac{\rho - (1-\gamma)(r + \frac{(\mu-r)^2}{2\gamma\sigma^2})}{\gamma}$.

3. **Log Utility ($\gamma = 1$) Special Case**:
   $$\pi^* = \frac{\mu - r}{\sigma^2}, \quad c^*(t, W_t) = \frac{\rho}{1 - e^{-\rho(T-t)}} W_t$$

## 3. Implementation Trade-offs
- Bertsimas-Lo: Provides analytical benchmark bridging naive TWAP and complex stochastic Almgren-Chriss algorithms.
- Merton (1971): Exact benchmark for automated treasury cash deployment and crypto perpetual risk budgeting.

## 4. Unresolved Questions
- Bounding short-sale and leverage constraints ($\pi^* \in [0, 1]$) vs unconstrained analytical solution.

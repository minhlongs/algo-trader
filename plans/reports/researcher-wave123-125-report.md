# Researcher Report: Wave 123–125 Institutional Desks

## 1. Executive Summary
Wave 123–125 completes three landmark pillars in institutional quantitative finance:
- **Desk 123 (Rubinstein 1994)**: Implied Binomial Tree (IBT) engine non-parametrically calibrating discrete terminal state probabilities and backward induction local probabilities to market option smile/skew, guaranteeing no-arbitrage ($0 \le p \le 1$).
- **Desk 124 (Lando 1998)**: Markov Rating Transition credit engine modeling continuous-time rating migration across 8 rating classes (AAA to D) via matrix uniformization $\mathbf{P}(t) = \exp(\mathbf{Q} t)$, yielding rating migration risk, survival curves, and credit spread curves.
- **Desk 125 (Obizhaeva-Wang 2013)**: Transient market impact & resilient order book execution router modeling exponential liquidity refill $e^{-\rho t}$, deriving optimal block jumps at $t=0, T$ and continuous constant velocity trading in between.

## 2. Mathematical Formalisms

### Desk 123: Rubinstein (1994) Implied Binomial Tree Engine
- Underlying asset $S_0$, risk-free rate $r$, dividend yield $q$, expiration $T$, steps $N$, up factor $u$, down factor $d = 1/u$.
- Recombining nodes at terminal step $N$: $S_{N, j} = S_0 u^j d^{N-j}$ for $j = 0, \dots, N$.
- Prior lognormal probability distribution: $P_j^0 = \binom{N}{j} p_0^j (1 - p_0)^{N-j}$ where $p_0 = \frac{e^{(r-q)\Delta t} - d}{u - d}$.
- Market implied terminal probabilities $P_j^*$ obtained by minimizing deviation $\sum_j (P_j - P_j^0)^2 / P_j^0$ subject to:
  1. $\sum_j P_j = 1, \quad P_j \ge 0$
  2. $\sum_j P_j S_{N, j} = S_0 e^{(r-q)T}$ (Martingale condition)
  3. Option pricing constraints: $e^{-r T} \sum_j P_j \max(S_{N, j} - K_m, 0) = C_m$.
- Backward induction for local transition probabilities:
  $p_{i, j} = \frac{F_{i, j} - S_{i+1, j}}{S_{i+1, j+1} - S_{i+1, j}}$ where forward price $F_{i, j}$ is derived from Arrow-Debreu state prices $\lambda_{i, j}$.

### Desk 124: Lando (1998) Markov Rating Transition Engine
- Generator matrix $\mathbf{Q} \in \mathbb{R}^{8 \times 8}$ with rows summing to 0: $q_{ii} = -\sum_{j \neq i} q_{ij}$, and $q_{i, j} \ge 0$ for $i \neq j$.
- State 8 is absorbing (Default $D$): $q_{8, j} = 0$ for all $j$.
- Transition probability matrix $\mathbf{P}(t) = \exp(\mathbf{Q} t)$ computed via Taylor series with scaling and squaring (or uniformization with Poisson rate $\gamma = \max_i |q_{ii}|$):
  $\mathbf{P}(t) = \sum_{k=0}^M \frac{(\mathbf{Q} t)^k}{k!}$.
- Default probability for initial rating $i$: $D_i(t) = P_{i, 8}(t)$.
- Survival probability: $Q_i(t) = 1 - D_i(t)$.
- Par CDS spread / credit spread: $s_i(t) = -\frac{1}{t} \ln(1 - (1 - R) D_i(t))$.
- Downgrade probability: $\sum_{j > i, j \neq 8} P_{i, j}(t)$.

### Desk 125: Obizhaeva-Wang (2013) Transient Impact Execution Router
- Parent order size $Q_0$, execution horizon $T$, $N$ execution intervals $\tau = T / N$.
- Transient impact resilience parameter $\rho > 0$, order book depth parameter $\lambda > 0$, bid-ask half-spread $s/2$.
- Exponential kernel: transient price impact decays as $G(\Delta t) = e^{-\rho \Delta t}$.
- Optimal discrete schedule $x_0, x_1, \dots, x_N$ where:
  - Initial block: $x_0 = \frac{Q_0}{2 + \rho T}$ (at $t = 0$)
  - Intermediate uniform slice: $x_k = \frac{\rho \tau Q_0}{2 + \rho T}$ for $k = 1, \dots, N-1$
  - Final block: $x_N = \frac{Q_0}{2 + \rho T}$ (at $t = T$)
  - Total traded: $x_0 + \sum_{k=1}^{N-1} x_k + x_N = Q_0 \frac{1 + \rho \tau (N-1) + 1}{2 + \rho T} = Q_0$.
- Expected execution cost:
  $J^* = \frac{s}{2} Q_0 + \frac{\lambda Q_0^2}{2 (2 + \rho T)} \left( 1 + \frac{\rho \tau}{1 - e^{-\rho \tau}} \right)$ (with continuous limit $J^*_{\text{cont}} = \frac{s}{2} Q_0 + \frac{\lambda Q_0^2}{2 + \rho T}$).
- Cost savings versus naive TWAP where lack of initial/terminal block trade causes resilience under-exploitation.

## 3. Engineering Constraints & Compliance
- Native TypeScript without external mathematical or matrix libraries.
- Matrix exponential with scaling & squaring for numerical stability ($L_1$ norm reduction).
- Strict sub-200 LOC per file boundary.
- Zero `:any` types.
- 100% zero-mock Vitest test suites.

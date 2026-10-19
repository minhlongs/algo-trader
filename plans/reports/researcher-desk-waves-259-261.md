# Research Report: Quantitative Trading Desk Models (Waves 259-261)
Date: 2026-10-13

## Executive Summary
Evaluation of non-linear order book impact, HF alpha-signal market making, and continuous-time transient impact kernels for execution optimization.

## Wave 259: Alfonsi, Schied & Slynko (2012) - Resilient Impact
- **Model**: Non-linear price impact $P_t = P_0 + \int_0^t F(v_s - \rho(P_s - P_0)) ds$.
- **Mechanism**: $F(x) = k \cdot \text{sgn}(x)|x|^\gamma$ (power-law), $\rho$ is the resilience (decay) rate.
- **Trade-offs**: Solves transient decay but non-linear PDE state-space is computationally heavy.
- **Adoption Risk**: High complexity for real-time execution; parameter calibration for $\rho$ is unstable in regime shifts.

## Wave 260: Cartea, Jaimungal & Ricci (2014) - Alpha-Driven MM
- **Model**: Mean-variance utility optimization $J = E[\int X_t d P_t - \phi \int q_t^2 dt]$.
- **Mechanism**: Dynamic skew via $\alpha_t$ (inventory-independent drift predictor) and $q_t$ (inventory control).
- **Architecture**: Separates alpha-signal forecast from inventory-risk inventory control.
- **Trade-offs**: Requires robust alpha estimation; susceptible to adverse selection (order flow toxicity).

## Wave 261: Gatheral, Schied & Slynko (2011) - Transient Exponential Impact
- **Model**: Linear-dynamic propagator $P_t = P_0 + \int_0^t G(t-s)v_s ds$.
- **Mechanism**: Kernel $G(t) = G_0 e^{-\beta t}$. Ensures no price manipulation in continuous trading.
- **Architecture**: Reduces optimal execution to a Fredholm integral equation of the second kind.
- **Trade-offs**: Mathematically elegant, optimal execution schedule (e.g., VWAP-relative) can be derived analytically.

## Ranked Recommendation
1. **Wave 261**: High architectural fit. Best performance/complexity ratio for deterministic execution.
2. **Wave 260**: Essential for MM desks. Requires higher infrastructure overhead for signal streaming.
3. **Wave 259**: Niche. Only for high-volume execution where non-linear resilience dominates linear assumptions.

## Limitations
- Research focus on theory; implementation requires validation against custom order flow data.
- Toxicity metrics (VPIN/VPID) not extensively evaluated across all models.

## Unresolved Questions
1. Optimal calibration frequency for $\rho$ (resilience) in the presence of latent liquidity?
2. Interaction between decay kernels (261) and alpha signals (260) in high-volatility regimes?

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>

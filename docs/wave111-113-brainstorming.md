# Wave 111-113 Brainstorming & Architecture Blueprint

## Executive Summary
Wave 111-113 expands the Institutional Quantitative Operating System with three foundational financial engineering and algorithmic microstructure engines:

1. **Desk 111: Black-Cox (1976) First-Passage Structural Credit Default Engine**
   - **Theory**: Structural credit model with endogenous/exogenous default boundary $V(t) = K \cdot e^{-\gamma (T - t)}$.
   - **Math**: First passage time density of geometric Brownian motion across an exponential barrier.
   - **Output**: Analytical survival probability $Q(T)$, cumulative default probability, and structural credit default swap (CDS) fair spread pricing.

2. **Desk 112: Madan-Seneta (1990) / Carr-Madan Variance Gamma (VG) Option Pricing Engine**
   - **Theory**: Pure jump process of finite variation constructed by subordinating arithmetic Brownian motion with a gamma process time change.
   - **Parameters**: $\sigma$ (volatility), $\nu$ (variance of gamma subordinator / kurtosis), $\theta$ (skewness drift).
   - **Math**: Analytical characteristic function evaluated via 15-point Gauss-Laguerre quadrature for European option pricing with heavy tails.

3. **Desk 113: Avellaneda-Stoikov (2008) High-Frequency Market Making Engine**
   - **Theory**: Optimal bid-ask limit order placement under inventory risk and order arrival intensity.
   - **Parameters**: Reservation price $r(s, q, t) = s - q \cdot \gamma \cdot \sigma^2 \cdot (T - t)$, optimal spread $\delta^a + \delta^b = \gamma \cdot \sigma^2 \cdot (T - t) + \frac{2}{\gamma} \ln(1 + \frac{\gamma}{\kappa})$.
   - **Output**: Asymmetric quoting spreads around mid-price balancing adverse selection and inventory holding penalties.

## Constraints & Standards
- 100% Zero-mock testing with Vitest.
- Strict `< 200 LOC` per file limit.
- Zero external numerical dependencies (pure native TypeScript).
- Zero TypeScript errors (`npx tsc --noEmit`).

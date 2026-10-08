# Wave 117-119 Deep Quantitative Brainstorming

## Quantitative Desks Selection
1. **Desk 117: Geske (1979) Compound Option Pricing Engine**
   - **Foundational Paper**: Robert Geske (1979), *The Valuation of Compound Options*, Journal of Financial Economics.
   - **Dynamics**: Valuation of options whose underlying is another option (Call-on-Call, Call-on-Put, Put-on-Call, Put-on-Put). First maturity $T_1$ with strike $K_1$, second maturity $T_2 > T_1$ with underlying strike $K_2$.
   - **Critical Asset Price**: Solves $C(S^*, T_2 - T_1, K_2) = K_1$ for critical asset value $S^*$ via Newton-Raphson.
   - **Analytical Pricing**: Bivariate normal distribution $M(a, b; \rho)$ where correlation coefficient $\rho = \sqrt{T_1 / T_2}$.
   - **Capital Structure Application**: Evaluates multi-tier capital structures, debt refinancing options, and staged corporate venture capital.

2. **Desk 118: Duffie-Singleton (1999) Reduced-Form Credit & Term Structure Engine**
   - **Foundational Paper**: Darrell Duffie & Kenneth J. Singleton (1999), *Modeling Term Structures of Defaultable Bonds*, Review of Financial Studies.
   - **Dynamics**: Reduced-form intensity-based credit risk model under Recovery of Market Value (RMV) with fractional loss $L \in (0, 1]$.
   - **Discounting & Intensity**: Adjusted default discount rate $R(t) = r(t) + \lambda(t) L$ with affine hazard intensity $d\lambda_t = \kappa(\theta - \lambda_t)dt + \sigma_\lambda \sqrt{\lambda_t} dW_t$.
   - **Analytical Bond Pricing**: Defaultable zero-coupon bond price $P(t, T) = A(T-t) \exp(-B(T-t)\lambda_t - C(T-t)r)$ derived from Riccati ODEs.
   - **Credit Derivatives**: Computes survival probability curves $Q(t, T)$, term structures of credit spreads, and fair par Credit Default Swap (CDS) spreads.

3. **Desk 119: Guéant-Tapia-Manziadi (2012) Closed-Form Optimal Market Making Engine**
   - **Foundational Paper**: Olivier Guéant, Charles-Albert Lehalle, Joaquin Fernandez-Tapia (2012), *Dealing with the inventory risk: a solution to the market making problem*, Mathematics and Financial Economics.
   - **Dynamics**: Finite-state continuous-time Markov decision process for high-frequency market making with inventory grid $q \in [-Q, Q]$, inventory penalty $\gamma$, intensity parameters $(A, k)$, and terminal liquidation penalty $\alpha_{term}$.
   - **Linearization Transformation**: Solves coupled non-linear HJB equations via Cole-Hopf transformation $w(t, q) = \exp(-k \gamma v(t, q))$, mapping value functions into a linear tridiagonal matrix differential system $\partial_t w + M w = 0$.
   - **Closed-Form Solution**: Computes exact matrix exponential/eigenvalue solutions without asymptotic heuristic approximations.
   - **Microstructure Outputs**: Evaluates optimal asymmetric quotes $\delta^{a*}(t, q)$ and $\delta^{b*}(t, q)$, reservation mid-prices, and bid-ask spreads.

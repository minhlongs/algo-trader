# Wave 114-116 Deep Quantitative Brainstorming

## Quantitative Desks Selection
1. **Desk 114: CGMY (2002) Pure Jump Lévy Option Engine**
   - **Foundational Paper**: Carr, Geman, Madan, Yor (2002), *The Fine Structure of Asset Returns: An Empirical Investigation*, Journal of Business.
   - **Dynamics**: Pure jump process generalizing Variance Gamma with four parameters $(C, G, M, Y)$.
   - **Characteristic Function**: $\psi(u) = C \Gamma(-Y) [ (M - iu)^Y - M^Y + (G + iu)^Y - G^Y ]$.
   - **Pricing Inversion**: Carr-Madan / Gil-Pelaez inversion with Gauss-Laguerre quadrature.
   - **Martingale Condition**: $\omega = -\psi(-i) = -C \Gamma(-Y) [ (M - 1)^Y - M^Y + (G + 1)^Y - G^Y ]$.

2. **Desk 115: Merton-KMV (1974) Structural Credit Risk & Distance-to-Default Engine**
   - **Foundational Paper**: Merton (1974), *On the Pricing of Corporate Debt: The Risk Structure of Interest Rates*, Journal of Finance; Crosbie & Bohn (2003), Moody's KMV.
   - **Dynamics**: Equity as a European call option on firm unobserved assets $V$ with strike equal to debt face value $D$.
   - **Calibration**: Bivariate system solving for unobserved $(V, \sigma_V)$ from observed equity market cap $E$ and equity volatility $\sigma_E$ via $E = V N(d_1) - D e^{-rT} N(d_2)$ and $\sigma_E E = N(d_1) \sigma_V V$.
   - **Metrics**: Distance-to-Default ($DD$), Expected Default Frequency ($EDF = N(-DD)$), risky debt valuation $B = V - E$, and fair credit spread.

3. **Desk 116: Cartea-Jaimungal (2014) Algorithmic Market Making Engine**
   - **Foundational Paper**: Cartea, Jaimungal & Ricci (2014), *Buy Low, Sell High: A High Frequency Trading Perspective*, SIAM Journal on Financial Mathematics.
   - **Dynamics**: Optimal quoting under running inventory penalty $\phi q^2$, terminal inventory penalty $\alpha q_T^2$, and short-term price drift (alpha signal).
   - **Metrics**: Reservation price, inventory skew, alpha directional tilt, and asymmetric optimal limit order spreads $\delta^{a*}, \delta^{b*}$.

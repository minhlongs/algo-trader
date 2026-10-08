# Research Report: Volatility Surface Arbitrage, Fixed Income Term Structure & Cross-Currency FX Triangulation

## 1. Volatility Surface Arbitrage Desk (`src/desk/volsurface/`)
- **Stochastic Volatility Inspired (SVI) Parametrization**:
  Total implied variance $w(k) = a + b \cdot \left(\rho (k - m) + \sqrt{(k - m)^2 + \sigma^2}\right)$ where $k = \ln(K/F)$.
  - Constraints for no calendar arbitrage: $\partial w / \partial T \ge 0$.
  - Constraints for no butterfly arbitrage: Durrleman condition $g(k) = (1 - \frac{k w'}{2w})^2 - \frac{w'^2}{4}(\frac{1}{w} + \frac{1}{4}) + \frac{w''}{2} \ge 0$.
- **Dupire Local Volatility**:
  $\sigma_{\text{local}}^2(K, T) = \frac{\frac{\partial C}{\partial T}}{K^2 \frac{\partial^2 C}{\partial K^2}}$ computed via finite difference grid.

## 2. Fixed Income Basis & Term Structure Desk (`src/desk/fixedincome/`)
- **Nelson-Siegel-Svensson (NSS) 6-Parameter Curve**:
  $y(t) = \beta_0 + \beta_1 \frac{1 - e^{-t/\tau_1}}{t/\tau_1} + \beta_2 \left(\frac{1 - e^{-t/\tau_1}}{t/\tau_1} - e^{-t/\tau_1}\right) + \beta_3 \left(\frac{1 - e^{-t/\tau_2}}{t/\tau_2} - e^{-t/\tau_2}\right)$.
- **Treasury Bond-Futures Basis & Cheapest-to-Deliver (CTD)**:
  - Conversion Factor (CF) adjusted basis: $\text{Gross Basis} = P_{\text{clean}} - (F_{\text{futures}} \times CF)$.
  - Implied Repo Rate (IRR): $\text{IRR} = \frac{F_{\text{futures}} \times CF + \text{Accrued}_{\text{delivery}} - P_{\text{dirty}}}{P_{\text{dirty}}} \times \frac{360}{\text{Days to Delivery}}$.
  - CTD selection: Maximizes Implied Repo Rate (or minimizes net basis).

## 3. Cross-Currency FX Triangulation Desk (`src/desk/fx/`)
- **Bellman-Ford Negative Log Cycle Arbitrage**:
  Transforms FX currency graph rates $R(A \to B)$ into edge weights $w(A, B) = -\ln(R(A \to B))$. Negative cycle detection implies $\prod R > 1.0$, signaling riskless triangular arbitrage profit after bid/ask spread and transaction costs.
- **Covered Interest Parity (CIP) & Forward Swap Points**:
  $F = S \times \frac{1 + r_d \cdot (T/360)}{1 + r_f \cdot (T/360)}$.
  $\text{CIP Basis} = \left(\frac{F}{S} \cdot (1 + r_f) - (1 + r_d)\right) \times 10^4$ (in bps).

## Unresolved Questions:
- None. Exact mathematical equations and constraints established.

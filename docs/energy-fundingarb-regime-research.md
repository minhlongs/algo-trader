# Research Report: Power & Energy, Crypto Funding Arb, and Volatility Regime Desks

## 1. Domain Requirements & Mathematical Formulations

### A. Power & Energy Desk (`src/desk/energy/`)
1. **Clean Spark & Dark Spreads**:
   - Gas Generation: $\text{CSS} = P_{\text{power}} - (\text{HR}_{\text{gas}} \cdot P_{\text{gas}}) - (\text{EF}_{\text{gas}} \cdot P_{\text{carbon}})$
   - Coal Generation: $\text{CDS} = P_{\text{power}} - (\text{HR}_{\text{coal}} \cdot P_{\text{coal}}) - (\text{EF}_{\text{coal}} \cdot P_{\text{carbon}})$
   - Where $\text{HR}$ is Heat Rate (MMBtu/MWh or GJ/MWh) and $\text{EF}$ is Emissions Factor ($\text{tCO}_2/\text{MWh}$).
2. **Battery / Pumped Storage Dispatch**:
   - Round-trip efficiency $\eta \in [0.80, 0.92]$.
   - Arbitrage opportunity: Charge when $P_{\text{off-peak}} < \eta \cdot P_{\text{peak}} - C_{\text{degradation}}$.

### B. Crypto Funding Rate Arb Desk (`src/desk/fundingarb/`)
1. **Perpetual Funding Rate Mechanism**:
   - Premium Index $P = \frac{\max(0, P_{\text{impact\_bid}} - P_{\text{index}}) - \max(0, P_{\text{index}} - P_{\text{impact\_ask}})}{P_{\text{index}}}$.
   - Funding Rate $F = P + \text{clamp}(I - P, -0.05\%, +0.05\%)$ where interest rate $I = 0.01\%$ per 8h.
2. **Delta-Neutral Spot-Perp Basis Carry**:
   - Long spot + short perp position: Net Delta $\approx 0$.
   - Annualized Yield: $\text{APY} = \left(1 + \sum_{t=1}^3 F_t\right)^{365} - 1$.
   - Liquidation margin buffer monitoring: Alert when Mark Price approaches spot liquidation threshold.

### C. Volatility & Covariance Regime-Switching Desk (`src/desk/regime/`)
1. **Hamilton Regime Filter**:
   - $y_t \sim \mathcal{N}(\mu_{S_t}, \sigma_{S_t}^2)$, state $S_t \in \{1, 2, \dots, K\}$ (Calm, Volatile, Crisis).
   - Transition probability matrix $\mathbf{P} = [p_{ij}]$, where $p_{ij} = \mathbb{P}(S_t = j \mid S_{t-1} = i)$.
   - Filtered probability update: $\xi_{t|t} \propto \xi_{t|t-1} \odot \eta_t$.
2. **DCC-GARCH Dynamic Covariance**:
   - Standardized residuals $\epsilon_t = D_t^{-1} (r_t - \mu)$.
   - Time-varying correlation $Q_t = (1 - \alpha - \beta)\bar{Q} + \alpha \epsilon_{t-1}\epsilon_{t-1}^T + \beta Q_{t-1}$.

## 2. Invariants & Architecture Constraints
- 100% deterministic pure TypeScript implementations (no mocks, zero external numerical dependencies).
- Strictly $\le 200$ LOC per source file.
- 0 `:any` types; passes `npx tsc --noEmit`.

# Research Report: Real-Time XVA, StatArb Graph & Liquidity Aggregation Trilogy

## 1. Domain 1: Real-Time XVA Engine (`src/desk/xva/`)
- **Mathematical Specification**:
  - Credit Valuation Adjustment (CVA): $\text{CVA} = (1 - R) \int_0^T \text{EE}^*(t) \cdot d\text{PD}(0, t)$ where $\text{EE}^*(t)$ is discounted expected positive exposure and $\text{PD}$ is counterparty default probability from CDS hazard rates $\lambda(t)$.
  - Debit Valuation Adjustment (DVA): $\text{DVA} = (1 - R_B) \int_0^T \text{ENE}^*(t) \cdot d\text{PD}_B(0, t)$ measuring bank's own default credit spread benefit.
  - Funding Valuation Adjustment (FVA): $\text{FVA} = \int_0^T s_F(t) \cdot \text{EPE}(t) \, dt - \int_0^T s_B(t) \cdot \text{ENE}(t) \, dt$ with funding spread $s_F$ over SOFR.
  - Bilateral Netting & Collateral Thresholds: ISDA Master Agreement netting sets: $V_{\text{net}} = \max(0, \sum_i V_i - C)$.

## 2. Domain 2: Statistical Arbitrage Graph Desk (`src/desk/statarb/`)
- **Mathematical Specification**:
  - Continuous Ornstein-Uhlenbeck (OU) Mean Reversion: $dX_t = \theta (\mu - X_t) dt + \sigma dW_t$.
  - Exact maximum likelihood calibration: $\theta = -\frac{\ln(b)}{\Delta t}$, $\mu = \frac{a}{1 - b}$, $\sigma = \sqrt{\frac{2\theta \cdot \text{Var}}{1 - b^2}}$.
  - Cointegration & Half-Life: $t_{1/2} = \frac{\ln(2)}{\theta}$. Dynamic $Z$-score signal generation: $Z_t = \frac{X_t - \mu}{\sigma_{\text{eq}}}$.
  - Asset Correlation Graph: Minimum Spanning Tree (MST) on distance metric $d_{ij} = \sqrt{2(1 - \rho_{ij})}$ for cluster discovery.

## 3. Domain 3: Dark Pool & ATS Liquidity Aggregator Desk (`src/desk/liquidity/`)
- **Mathematical Specification**:
  - Multi-Venue Smart Sweeper: Optimal child slice sizing across displayed venues (lit) and non-displayed ATS/dark pools based on fill rate probability $P_k(\text{fill})$ and price improvement $\delta_k$.
  - Almgren-Chriss Temporary & Permanent Market Impact: $I_{\text{perm}} = \gamma \cdot \frac{Q}{V}$, $I_{\text{temp}} = \eta \cdot \left(\frac{q}{\tau V}\right)^\alpha$.
  - Adverse Selection & Toxicity Filter: Information leakage metric tracking post-trade alpha drift $\Delta p_{\tau}$ and penalizing toxic dark venues with low fill ratios and adverse drift.

## Unresolved Questions:
- None. Closed-form models and discrete event state filters fully specified.

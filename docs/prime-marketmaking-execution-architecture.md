# Prime Brokerage, HFT Market Making & Algorithmic Execution Trilogy Architecture

## Executive Summary

This architecture specification details the three institutional trading capability suites implemented for `algo-trader`:
1. **Prime Brokerage & Synthetic Financing Suite** (`src/desk/prime/`)
2. **High-Frequency Market Making & Hawkes Toxicity Suite** (`src/desk/marketmaking/`)
3. **Algorithmic Execution & Optimal Scheduling Suite** (`src/desk/execution/`)

All implementations adhere strictly to the repository standards: zero external mocks/fake data in tests, strict $\le 200$ LOC limit per source file, zero `:any` types, zero `eslint-disable` additions, and 100% green tests.

---

## 1. Prime Brokerage & Synthetic Financing (`src/desk/prime/`)

### 1.1 Securities Lending & Dynamic Borrow Curves (`securities-lending-engine.ts`)
- **Inventory Pool Model**: Segregates internal inventory from third-party lending pools, managing allocations, availability, and capacity.
- **Piecewise Dynamic Borrow Fee Curve**:
  $$\text{Fee}(u) = \begin{cases}
  r_{\text{base}} + \frac{u}{u_{\text{kink}}} \cdot s_1 & \text{if } u \le u_{\text{kink}} \\
  r_{\text{base}} + s_1 + \frac{u - u_{\text{kink}}}{1 - u_{\text{kink}}} \cdot s_2 & \text{if } u > u_{\text{kink}}
  \end{cases}$$
  Where $u$ is inventory utilization rate, $u_{\text{kink}}$ is the optimal utilization kink (default 80%), $s_1$ is normal slope (150 bps), and $s_2$ is steep slope (3000 bps) for hard-to-borrow assets.
- **Locate Lifecycle**: Issues time-bounded authorizations (`validityMs`) and automatically prunes expired locates to restore pool capacity.

### 1.2 Total Return Swap (TRS) Pricer (`total-return-swap-pricer.ts`)
- **Dual-Leg Synthetic Contract Netting**:
  - **Equity Performance Leg**: $\Delta P_{\text{equity}} = Q \cdot (P_{\text{current}} - P_{\text{reset}})$
  - **Financing Benchmark Leg**: $F_{\text{due}} = Q \cdot P_{\text{reset}} \cdot \left(\frac{r_{\text{benchmark}} + \text{spread}_{\text{bps}}}{10000}\right) \cdot \left(\frac{\text{days}}{360}\right)$
  - **Net Periodic Cash Flow**: $\text{Net} = \Delta P_{\text{equity}} - F_{\text{due}}$ (positive flow is receivable, negative is payable).
- **Mark-to-Market (MtM) Valuation**: Real-time evaluation of unrealized equity gains and accrued funding liabilities without triggering intermediate resets.

### 1.3 Rehypothecation & Segregation Guard (`rehypothecation-guard.ts`)
- **Regulatory Framework**: SEC Rule 15c3-3 customer protection and UK FCA CASS compliance.
- **Pledge Cap**: Rehypothecation limited to 140% of customer margin debit:
  $$\text{MaxPledge} = \text{Debit}_{\text{margin}} \times 1.40$$
- **Asset Haircut Matrix**: Cash (0%), Sovereign Treasuries (2%), Equities (15%), Cryptocurrencies (50%).
- **Segregated Reserve**: Enforces that client collateral in excess of permissible pledge limits is placed in custody lockboxes with zero commingling.

---

## 2. High-Frequency Market Making & Hawkes Toxicity (`src/desk/marketmaking/`)

### 2.1 Bivariate Hawkes Jump Intensity Estimator (`hawkes-intensity-estimator.ts`)
- **Stochastic Intensity Dynamics**:
  $$\lambda_t^{\text{buy}} = \mu + \int_0^t \alpha_{\text{self}} e^{-\beta(t - s)} dN_s^{\text{buy}} + \int_0^t \alpha_{\text{cross}} e^{-\beta(t - s)} dN_s^{\text{sell}}$$
  $$\lambda_t^{\text{sell}} = \mu + \int_0^t \alpha_{\text{self}} e^{-\beta(t - s)} dN_s^{\text{sell}} + \int_0^t \alpha_{\text{cross}} e^{-\beta(t - s)} dN_s^{\text{buy}}$$
- **Order Flow Toxicity Levels**: Evaluates self-excitation and cross-excitation imbalance $\frac{|\lambda_{\text{buy}} - \lambda_{\text{sell}}|}{\lambda_{\text{total}}}$. Spikes beyond $4\times$ to $8\times$ baseline rate trigger `HIGH` and `CRITICAL` toxicity warnings for automated quote pulling.

### 2.2 Guéant-Tapia-Manzi Inventory Skew Quoting (`inventory-skew-quote-engine.ts`)
- **Optimal Market Making Under Risk Aversion**: Closed-form implementation of Avellaneda-Stoikov & Guéant-Tapia-Manzi (2012) inventory risk model.
- **Reservation Price**:
  $$R(s, q, t) = s - q \cdot \gamma \cdot \sigma^2 \cdot (T - t)$$
- **Asymmetric Quoting Spreads**:
  $$\delta^b(q) = (s - R) + \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{k}\right) + \frac{1}{2}\gamma\sigma^2(T - t)$$
  $$\delta^a(q) = (R - s) + \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{k}\right) + \frac{1}{2}\gamma\sigma^2(T - t)$$
  When holding long inventory ($q > 0$), reservation price shifts lower, skewing the optimal bid down and ask closer to midpoint to shed inventory.

### 2.3 Adverse Selection Predictor (`adverse-selection-predictor.ts`)
- **Post-Trade Markout Horizons**: Evaluates market maker fills against $10\text{ms}$, $100\text{ms}$, and $1\text{s}$ post-trade price paths.
- **Toxicity Metric**: Fills exhibiting immediate short-horizon price movement against the market maker's position exceeding $3.0\text{ bps}$ are flagged as toxic order flow. Tracks historical toxic flow ratios to throttle toxic venues.

---

## 3. Algorithmic Execution & Optimal Scheduling (`src/desk/execution/`)

### 3.1 Adaptive TWAP & VWAP Volume Scheduler (`twap-vwap-scheduler.ts`)
- **Intraday U-Shaped Profile**: Models canonical open-close volume spikes (18% market volume at open/close, 5% midday).
- **Volume Surprise Adaptation**:
  $$Q_{\text{slice}} = \left(\frac{Q_{\text{remaining}}}{N_{\text{remaining}}}\right) \cdot \text{clamp}\left(\frac{V_{\text{realized}}}{V_{\text{expected}}}, 0.5, 2.0\right)$$
  Accelerates execution pacing when liquidity is elevated and throttles when market activity thins.

### 3.2 Almgren-Chriss Optimal Liquidation Trajectory (`almgren-chriss-executor.ts`)
- **Calculus of Variations Solution**:
  $$\kappa \approx \sqrt{\frac{\lambda \sigma^2}{\eta}}$$
  $$x(t) = X_0 \frac{\sinh(\kappa (T - t))}{\sinh(\kappa T)}$$
- **Efficient Frontier Tradeoff**: Computes expected transaction cost $E[x]$ (temporary impact $\eta$ and permanent impact $\gamma$) alongside variance of capture $V[x]$ parameterized by the trader's risk aversion $\lambda$.

### 3.3 Iceberg & Discretionary Peg Router (`iceberg-discretionary-router.ts`)
- **Reserve Slicing**: Exposes only small display quantities while keeping the balance in hidden reserve.
- **Randomized Jitter**: Applies deterministic variance ($\pm 10\%$) to slice quantities to mask execution fingerprints from HFT sniffing algorithms.
- **Discretion Peg Offsets**: Specifies discretionary price improvement offsets to capture queue priority on lit exchanges.

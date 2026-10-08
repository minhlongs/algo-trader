# Institutional Trading Desk Architecture: Collateral & Cross-Margining, Exotic Derivatives, and HFT Alpha Dynamics

## Overview
This architectural specification details the mathematical models, algorithmic execution logic, and risk controls introduced for the three institutional desks:
1. **Collateral & Cross-Margining Optimization** (`src/desk/margin/`)
2. **Exotic Derivatives & Structured Products** (`src/desk/structured/`)
3. **HFT Order Flow Dynamics & Alpha Synthesis** (`src/desk/alphadynamics/`)

---

## 1. Collateral & Cross-Margining Optimization Desk (`src/desk/margin/`)

### 1.1 ISDA SIMM v2.6 Initial Margin (`IsdaSimmEngine`)
- **Sensitivity Aggregation**: Aggregates weighted Delta ($WS_k = S_k \times RW_k$), Vega, and Curvature across risk buckets with inter-bucket correlation ($\rho$):
  $$IM_{\text{delta}} = \sqrt{\sum_i \sum_j WS_i \cdot WS_j \cdot \rho_{ij}} \times S_{\text{conc}}$$
- **Concentration Scaling Factor**:
  $$S_{\text{conc}} = \max\left(1.0, \sqrt{\max\left(1.0, \frac{\sum |WS_k|}{\text{Threshold}}\right)}\right)$$
- **Total Initial Margin**:
  $$IM_{\text{total}} = \sqrt{IM_{\text{delta}}^2 + IM_{\text{vega}}^2 + IM_{\text{curvature}}^2}$$

### 1.2 Multi-Asset Cross-Margining (`CrossMarginingEngine`)
- **Portfolio Covariance Netting**: Evaluates quadratic portfolio variance across cross-margined asset classes (Equity, FX, Rates, Commodity, Crypto):
  $$\text{Margin}_{\text{diversified}} = \min\left(\text{GrossMargin}, \sqrt{\sum_A \sum_B M_A \cdot M_B \cdot \rho_{AB}}\right)$$
- **Capital Efficiency Ratio**:
  $$\text{Efficiency} = \frac{\text{GrossMargin}}{\text{DiversifiedMargin}}$$

### 1.3 Collateral Waterfall Allocator (`CollateralWaterfallAllocator`)
- Prioritizes pledging across Liquidity Tiers 1–4.
- Preserves Tier 1 Cash by defaulting to lower-tier pledges (e.g. Corporate Bonds, Sovereign Debt).
- Haircut adjustment:
  $$V_{\text{post}} = V_{\text{market}} \times (1 - h)$$

---

## 2. Exotic Derivatives & Structured Products Desk (`src/desk/structured/`)

### 2.1 Analytical Continuous Barrier Option (`BarrierOptionPricer`)
- **Reflection Principle**: Closed-form analytical formula for down-and-out, down-and-in, up-and-out, and up-and-in European calls.
- **In-Out Parity**:
  $$\text{Price}_{\text{in}} + \text{Price}_{\text{out}} = \text{Price}_{\text{vanilla}}$$
- **Finite Difference Greeks**: Numerical central finite differences for Delta ($\Delta$) and Gamma ($\Gamma$).

### 2.2 Autocallable Reverse Convertible Note (`AutocallableNotePricer`)
- Multi-asset worst-of basket evaluation:
  $$R_{\text{worst}} = \min_i \left(\frac{S_{i,\text{current}}}{S_{i,\text{initial}}}\right)$$
- Early redemption observation schedule with memory coupon accumulation and knock-in barrier capital loss mapping at maturity.

### 2.3 Cliquet / Ratchet Structured Payoffs (`CliquetPayoffEngine`)
- Periodic return truncation with local cap ($C$) and local floor ($F$):
  $$r_{t,\text{eff}} = \min(C, \max(F, r_t))$$
- Global floor ($G$) principal guarantee:
  $$\text{Payoff} = N \times \left(1 + \max\left(G, \sum r_{t,\text{eff}}\right)\right)$$

---

## 3. HFT Order Flow Dynamics & Alpha Synthesis (`src/desk/alphadynamics/`)

### 3.1 Multi-Level OFI with Continuous Decay (`MultiLevelOfiEngine`)
- Computes Cont-Kukanov-Stoikov Order Flow Imbalance across $M$ levels.
- Kyle-Obizhaeva continuous exponential decay kernel:
  $$OFI_{\text{decay}} = \sum_{m=0}^{M-1} OFI_m \cdot e^{-\lambda \cdot m}$$
- Rolling standard score normalization ($z$-score).

### 3.2 High-Frequency Queue Stuffing Detector (`QueueStuffingDetector`)
- Rolling time-window tracking of event types (`NEW`, `CANCEL`, `TRADE`, `REPLACE`).
- Cancel-to-trade ratio and event burst frequency (Hz) triggers anomaly alerts and queue-stuffing flag.

### 3.3 Online Kalman Filter Alpha Combiner (`KalmanAlphaCombiner`)
- Recursive Bayesian estimation of optimal alpha weights $\mathbf{w}_t$:
  - State prediction: $\mathbf{P}_{t|t-1} = \mathbf{P}_{t-1} + \mathbf{Q}$
  - Innovation: $\tilde{y}_t = r_t - \mathbf{H}_t \mathbf{w}_{t-1}$
  - Kalman Gain: $\mathbf{K}_t = \mathbf{P}_{t|t-1} \mathbf{H}_t^T / S_t$
  - State update: $\mathbf{w}_t = \mathbf{w}_{t-1} + \mathbf{K}_t \tilde{y}_t$

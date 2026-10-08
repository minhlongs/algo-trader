# Research Report: Commodities Basis & Spreads, Multi-Factor Portfolio Optimization & L2 Microstructure Flow

## 1. Commodities Basis & Calendar Spreads (`src/desk/commodities/`)
- **Cost of Carry & Convenience Yield**:
  $F(t, T) = S(t) \cdot e^{(r + u - y)(T - t)}$ where $u$ is physical storage/insurance cost and $y$ is the convenience yield.
  - Backwardation ($y > r + u$): Inverted curve, positive roll yield for long positions.
  - Contango ($y < r + u$): Upward-sloping curve, negative roll yield for long positions, cash-and-carry storage arbitrage window.
  - **Samuelson Effect**: Forward volatility $\sigma(T)$ increases as maturity approaches delivery date: $\sigma(T) = \sigma_0 e^{-\alpha(T - t)}$.

## 2. Multi-Factor Portfolio Optimization (`src/desk/portfolio/`)
- **Ledoit-Wolf Shrinkage Covariance**:
  $\Sigma_{\text{shrunk}} = \delta F + (1 - \delta) S$, where $S$ is sample covariance, $F$ is single-index constant correlation target, and $\delta \in [0, 1]$ is optimal analytical shrinkage intensity.
- **Risk Parity & Equal Risk Contribution (ERC)**:
  Solves $\arg\min_w \sum_i \sum_j (w_i (\Sigma w)_i - w_j (\Sigma w)_j)^2$ subject to $\sum w_i = 1, w_i \ge 0$.
  Marginal Risk Contribution $\text{MRC}_i = \frac{(\Sigma w)_i}{\sqrt{w^T \Sigma w}}$, Total Risk Contribution $\text{TRC}_i = w_i \cdot \text{MRC}_i$.

## 3. L2 Microstructure Order Flow Toxicity (`src/desk/microstructure/`)
- **Volume Synchronized Probability of Toxicity (VPIN)**:
  Groups trades into constant-volume buckets $V$. For each bucket $\tau$:
  $\text{VPIN} = \frac{\sum_{\tau=1}^N |V_\tau^B - V_\tau^S|}{N \cdot V}$ where buyer/seller initiated volume is partitioned via bulk volume classification.
- **Order Flow Imbalance (OFI)**:
  Multi-level depth delta $\text{OFI}_t = \Delta q_{\text{bid}} - \Delta q_{\text{ask}}$ predicting short-term price tick drift.

## Unresolved Questions:
- None. Mathematical models, formulas, and edge conditions fully specified.

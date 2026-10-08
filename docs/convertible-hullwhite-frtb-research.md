# Convertible Bond Arbitrage, Hull-White Short Rate & Liquidity-Adjusted FRTB VaR Research

## 1. Convertible Bond Arbitrage Desk (`src/desk/convertible/`)
- **Hybrid Valuation & Greeks**: Evaluates convertible bond pricing as straight debt floor plus embedded American/European call option on equity.
- **Delta-Hedging & Gamma Scalping**: Computes equity delta ($\Delta = N \cdot N(d_1)$), determines equity short ratio to neutralize directional market exposure, and monetizes realized volatility via gamma scalping.
- **Credit-Equity Interaction**: Evaluates Tsiveriotis-Fernandes or binomial tree jump-to-default dynamics where equity and credit spread shocks trigger asymmetric payoff profiles.

## 2. 1-Factor Hull-White Short Rate Desk (`src/desk/shortrate/`)
- **Stochastic Interest Rate Dynamics**: $dr(t) = (\theta(t) - a r(t))dt + \sigma dW(t)$ mean-reverting Gaussian short-rate model.
- **Analytical Zero-Coupon Bond Pricing**: $P(t, T) = A(t, T) \exp(-B(t, T) r(t))$ with $B(t, T) = \frac{1 - e^{-a(T - t)}}{a}$.
- **Jamshidian Decomposition**: Analytical pricing of European swaptions and bond options by decomposing portfolio payoff into individual zero-coupon bond options at strike yield $r^*$.

## 3. Liquidity-Adjusted Risk & Basel FRTB Desk (`src/desk/lvar/`)
- **Bangia Liquidity Spread Adjustment**: Incorporates bid-ask spread distribution into VaR/ES:
  $$\text{L-VaR} = \text{VaR}_{\alpha} + \frac{1}{2} (\bar{S} + k_{\alpha} \sigma_S)$$
  capturing endogenous liquidation discount during market stress.
- **Basel III / FRTB Expected Shortfall (ES)**: Replaces standard 99% VaR with 97.5% Expected Shortfall across multi-horizon liquidity horizons (10d, 20d, 40d, 60d, 120d).
- **Extreme Value Theory (EVT) Peaks-Over-Threshold**: Models fat-tailed tail losses beyond high threshold $u$ using the Generalized Pareto Distribution (GPD).

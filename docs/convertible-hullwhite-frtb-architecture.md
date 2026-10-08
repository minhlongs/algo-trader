# Convertible Bond Arb, Hull-White Short Rate & Liquidity FRTB Architecture

## Overview
Comprehensive institutional trading engines across hybrid equity-linked credit arbitrage, Gaussian 1-factor stochastic short-rate yield curve dynamics, and Basel FRTB liquidity-adjusted market risk calculation.

## 1. Convertible Bond Arbitrage Desk (`src/desk/convertible/`)
- `convertible-types.ts`: Bond indenture terms, conversion ratio, equity parity, Greeks, and delta hedge parameters.
- `convertible-pricing-engine.ts`: Calculates conversion value $P_{\text{conv}} = \text{CR} \cdot S$, investment bond floor, and embedded option value via Black-Scholes/Merton formulation.
- `convertible-delta-hedger.ts`: Determines optimal equity short hedge shares $H = \Delta \cdot \text{Contracts}$, net exposure, and gamma scalping PnL given realized stock movement.

## 2. 1-Factor Hull-White Short Rate Desk (`src/desk/shortrate/`)
- `hull-white-types.ts`: Mean-reversion speed $a$, short rate volatility $\sigma$, term structure yields, and zero-coupon bond discount factors.
- `hull-white-zero-bond-engine.ts`: Calculates affine term structure discount factors $A(t, T)$ and $B(t, T)$, zero bond prices $P(t, T)$, and instantaneous forward rates.
- `jamshidian-swaption-pricer.ts`: Decomposes European coupon bond options into portfolio of zero-coupon bond options using the critical short rate $r^*$.

## 3. Liquidity-Adjusted Risk & Basel FRTB Desk (`src/desk/lvar/`)
- `lvar-types.ts`: Return series, bid-ask spread distributions, confidence levels, and FRTB liquidity horizons.
- `bangia-lvar-calculator.ts`: Evaluates endogenous exogenous liquidity haircut $\frac{1}{2}(\bar{S} + 1.96 \sigma_S)$ added to parametric/historical VaR.
- `frtb-expected-shortfall-engine.ts`: Computes Basel 97.5% Expected Shortfall across scalable liquidity horizons with EVT tail-index adjustment.

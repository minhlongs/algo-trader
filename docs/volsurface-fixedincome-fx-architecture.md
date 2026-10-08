# Volatility Surface, Fixed Income & FX Triangulation Architecture

## Overview
Institutional quantitative trading desks covering non-linear volatility arbitrage, fixed income basis curves, and cross-currency triangular arbitrage.

## 1. Volatility Surface Arbitrage Desk (`src/desk/volsurface/`)
- `volsurface-types.ts`: SVI parameters, implied volatility slices, Durrleman butterfly conditions.
- `svi-calibrator.ts`: Quasi-explicit raw SVI formulation $w(k) = a + b \cdot (\rho(k-m) + \sqrt{(k-m)^2 + \sigma^2})$ calibrating total variance slices and evaluating Durrleman condition $g(k) \ge 0$.
- `dupire-local-vol-pricer.ts`: Continuous local volatility extraction via finite difference on total variance slices.
- `calendar-butterfly-arbitrage-detector.ts`: High-precision arbitrage detector enforcing $\partial w / \partial T \ge 0$ and butterfly bounds.

## 2. Fixed Income Basis & Curve Desk (`src/desk/fixedincome/`)
- `fixedincome-types.ts`: Nelson-Siegel-Svensson 6-parameter model, deliverable bond baskets, basis metrics.
- `nelson-siegel-svensson-curve.ts`: Continuous zero-coupon yield curve, instantaneous forward rates, and discount factors.
- `bond-futures-basis-engine.ts`: Gross basis, net carry, and Implied Repo Rate (IRR) calculation for Treasury bond-futures pairs.
- `cheapest-to-deliver-calculator.ts`: Optimizer ranking deliverable bond baskets by maximum IRR and minimum net basis.

## 3. Cross-Currency FX Triangulation Desk (`src/desk/fx/`)
- `fx-types.ts`: Currency pairs, bid/ask quotes, triangular cycle paths, Covered Interest Parity (CIP) parameters.
- `bellman-ford-triangular-arb.ts`: Graph cycle detection searching for negative log exchange rate cycles $\prod R > 1.0$.
- `cip-basis-calculator.ts`: Covered Interest Parity deviation engine in basis points with directionality.
- `fx-forward-swap-pricer.ts`: Forward swap points generator across standardized money market tenors.

# Tech Stack & Implementation Blueprint: Trilogy Waves 36-38

## 1. Directory Structure & File Boundaries
- `src/desk/volsurface/`:
  - `volsurface-types.ts`: SVI parameters, strike/expiry volatility slices, Durrleman butterfly conditions.
  - `svi-calibrator.ts`: Raw SVI formulation calibrator enforcing $b \ge 0, |\rho| < 1, \sigma > 0$.
  - `dupire-local-vol-pricer.ts`: Continuous local volatility extraction via finite differences on total variance.
  - `calendar-butterfly-arbitrage-detector.ts`: Arbitrage bounds tester for calendar spreads and butterflies.
- `src/desk/fixedincome/`:
  - `fixedincome-types.ts`: NSS parameters, deliverable bond baskets, basis calculations, IRR.
  - `nelson-siegel-svensson-curve.ts`: Continuous zero-coupon spot rate generator and discount factor model.
  - `bond-futures-basis-engine.ts`: Gross/net basis and net carry calculations.
  - `cheapest-to-deliver-calculator.ts`: Delivery basket optimizer ranking CTD bonds by max IRR.
- `src/desk/fx/`:
  - `fx-types.ts`: Currency pairs, bid/ask rates, FX forward swaps, triangular arbitrage cycles.
  - `bellman-ford-triangular-arb.ts`: Negative-cycle graph search yielding optimal cross-currency trading routes.
  - `cip-basis-calculator.ts`: Covered Interest Parity basis and forward swap point pricer.

## 2. Invariants & Rules
- Zero external numerical libraries; pure TypeScript with 0 `:any`.
- All files strictly $\le 200$ LOC.
- Comprehensive unit tests under `tests/unit/desk/volsurface/`, `tests/unit/desk/fixedincome/`, `tests/unit/desk/fx/`.

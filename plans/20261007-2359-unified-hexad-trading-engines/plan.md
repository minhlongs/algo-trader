# Plan: Unified 6-Engine Institutional Trading Desk Suite

## Overview
Bootstrap and implement 6 institutional trading desk engines across quantitative signals, market making strategies, portfolio risk parity, toxic flow defense, combinatorial SOR routing, and AMM LP LVR yield optimization.

## Engines Specification & Locations
1. **Lead-Lag Alpha Predictor**: `src/desk/signal/lead-lag-alpha-types.ts` & `src/desk/signal/lead-lag-alpha-predictor.ts`
   - Model: Asynchronous Hayashi-Yoshida cross-correlation & Hawkes process jump intensity.
2. **Binary Avellaneda-Stoikov Inventory Skew Quoter**: `src/desk/strategies/inventory-skew-types.ts` & `src/desk/strategies/inventory-skew-quoter.ts`
   - Model: Continuous reservation price with $s(1-s)$ variance penalty and asymmetric depth spreads.
3. **Binary Risk Parity & CVaR Optimizer**: `src/desk/portfolio/binary-risk-parity-types.ts` & `src/desk/portfolio/binary-risk-parity-optimizer.ts`
   - Model: Quadratic programming with Rockafellar-Uryasev Conditional Value-at-Risk under $[0, 1]$ binary loss bounds.
4. **VPIN Toxic Flow Classifier**: `src/desk/risk/vpin-toxic-flow-types.ts` & `src/desk/risk/vpin-toxic-flow-classifier.ts`
   - Model: Volume-Synchronized Probability of Toxicity & Shannon order flow tick entropy.
5. **Combinatorial Bundle Fill Router**: `src/desk/sor/combinatorial-bundle-types.ts` & `src/desk/sor/combinatorial-bundle-router.ts`
   - Model: Multi-leg atomic conditional bundle fill router with skew tolerance and rollback triggers.
6. **LP LVR & Yield Sentinel**: `src/desk/amm/lp-lvr-yield-types.ts` & `src/desk/amm/lp-lvr-yield-sentinel.ts`
   - Model: Real-time Loss-Versus-Rebalancing estimation and dynamic delta-hedge rebalancing.

## Quality Invariants
- 100% green unit tests across Vitest.
- Zero TypeScript compiler errors (`tsc --noEmit`).
- Zero `:any` types.
- Zero `eslint-disable` annotations.
- Strict $\le 200$ LOC per file limit.

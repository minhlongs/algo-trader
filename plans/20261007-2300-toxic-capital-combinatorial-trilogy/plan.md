# Implementation Plan: Toxic Flow Defense, Capital Efficiency & Synthetic Combinatorial Trilogy

## Components
1. **AdverseSelectionGuard** (`src/desk/risk/adverse-selection-guard.ts`, `src/desk/risk/adverse-selection-types.ts`)
   - Tracks rolling VPIN and Order Flow Imbalance (OFI).
   - Computes dynamic spread multiplier: $multiplier = 1 + \kappa \cdot \max(0, VPIN - VPIN_{threshold})$.
   - Emits quote cancel / purge alerts when toxicity exceeds hard limit.

2. **CapitalEfficiencyOptimizer** (`src/desk/portfolio/capital-efficiency-optimizer.ts`, `src/desk/portfolio/capital-efficiency-types.ts`)
   - Tracks available margin, maintenance margin, and deployed capital across venues.
   - Calculates return-on-collateral (ROC) for active and proposed strategies.
   - Generates capital rebalance transfers to eliminate idle margin drag.

3. **SyntheticCombinatorialEngine** (`src/desk/pricing/synthetic-combinatorial-engine.ts`, `src/desk/pricing/synthetic-combinatorial-types.ts`)
   - Validates probability simplex: $\sum_{i=1}^N p_i = 1$ for partition markets.
   - Computes Fréchet bounds for joint events: $\max(0, p_A + p_B - 1) \le p_{A \cap B} \le \min(p_A, p_B)$.
   - Detects synthetic discount / premium bundle arbitrage packages.

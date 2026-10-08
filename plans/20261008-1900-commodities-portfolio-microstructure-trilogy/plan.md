# Institutional Commodities, Portfolio & Microstructure Trilogy Plan

## Overview
Expand the quantitative trading ecosystem with three complementary institutional trading desks:
1. **Commodities Desk (`src/desk/commodities/`)**: Storage cost, convenience yield inversion, Samuelson maturity volatility decay, and calendar spread roll yield optimizer.
2. **Portfolio Desk (`src/desk/portfolio/`)**: Ledoit-Wolf analytical covariance shrinkage, Equal Risk Contribution (ERC) cyclical coordinate descent optimizer, and Barra factor risk decomposition.
3. **Microstructure Desk (`src/desk/microstructure/`)**: Volume Synchronized Probability of Toxicity (VPIN) continuous estimator and multi-level Level 2 Order Flow Imbalance (OFI).

## Invariants
- 100% deterministic pure TypeScript algorithms (zero external numerical libraries, 0 `:any`).
- All source files $\le 200$ LOC.
- Comprehensive unit test coverage across all desks.
- Clean git workflow with conventional commit and squash merge into `main`.

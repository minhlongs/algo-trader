# Institutional VolSurface, Fixed Income & FX Trilogy Plan

## Overview
Expand the quantitative trading ecosystem with three production-grade institutional trading desks:
1. **VolSurface Desk (`src/desk/volsurface/`)**: Raw SVI calibration, Dupire continuous local volatility extraction, and calendar/Durrleman butterfly arbitrage verification.
2. **Fixed Income Desk (`src/desk/fixedincome/`)**: Nelson-Siegel-Svensson 6-parameter continuous term structure, bond-futures basis engine, and Cheapest-to-Deliver (CTD) basket optimizer with Implied Repo Rate (IRR).
3. **FX Desk (`src/desk/fx/`)**: Bellman-Ford negative-log cycle detector for real-time triangular arbitrage, Covered Interest Parity (CIP) pricer, and forward swap points calculator.

## Invariants
- 100% deterministic pure TypeScript algorithms (zero external numerical libraries, 0 `:any`).
- All source files $\le 200$ LOC.
- Comprehensive unit test coverage across all desks.
- Clean git workflow with conventional commit and squash merge into `main`.

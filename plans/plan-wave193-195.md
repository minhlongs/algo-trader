# Implementation Plan - Quantitative Waves 193-195

## Overview
Implement Waves 193-195 covering Dupire (1994) Continuous Local Volatility Surface, Bollerslev (1986) & Glosten-Jagannathan-Runkle (1993) GJR-GARCH Asymmetric Volatility, and Biais-Hillion-Spatt (1995) Empirical LOB Microstructure & Order Flow Transitions.

## Architecture
- All files strictly < 180 LOC, 0 `:any`, 0 `console.log`.
- Zero mock dependencies; analytical characteristic functions, PDE/SDE discretizations, QMLE optimization, Markov transition matrices.
- Modules in `src/desk/`:
  - `src/desk/dupire/`: Local Volatility Surface & Pricer
  - `src/desk/garch/`: GJR-GARCH Engine & Term Structure Forecast
  - `src/desk/biais/`: Empirical LOB Microstructure & Order Flow Transitions
- 100% test pass rate with unit tests in `tests/unit/desk/`.

## Phases
1. Wave 193: Dupire (1994) Local Volatility Surface
2. Wave 194: GJR-GARCH (1993) Asymmetric Volatility & QMLE
3. Wave 195: Biais-Hillion-Spatt (1995) Empirical LOB Microstructure
4. Comprehensive Vitest verification and modularization audit

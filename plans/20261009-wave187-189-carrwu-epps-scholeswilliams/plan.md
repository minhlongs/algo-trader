# Plan: Wave 187-189 Quantitative Triad & Desk Deep Modularization

## Overview
Implement three classical quantitative models (Carr-Wu 2004 FMLS, Epps 1979 Correlation Decay, Scholes-Williams 1977 Non-Synchronous Beta) and modularize 5 oversized desk files under the strict 180 LOC threshold.

## Execution Strategy
- All source files strictly under 180 LOC.
- Zero mock data, zero `:any` types, zero `console.log` in production code.
- 100% test coverage with real numerical algorithms and zero-drift invariants.

## Phases
- [ ] Phase 1: Carr-Wu (2004) Finite Moment Log-Stable Suite (`src/desk/carrwu/`)
- [ ] Phase 2: Epps (1979) High-Frequency Asynchronous Correlation Decay Suite (`src/desk/eppseffect/`)
- [ ] Phase 3: Scholes-Williams (1977) Non-Synchronous Trading Beta Suite (`src/desk/scholeswilliams/`)
- [ ] Phase 4: Desk Deep Modularization of 5 Oversized Files (< 180 LOC / file)
  - `src/desk/polymarket/live-trading-orchestrator.ts` (< 180 LOC)
  - `src/desk/strategies/polymarket/smart-money-divergence.ts` (< 180 LOC)
  - `src/desk/marl/agents/multi-agent-coordinator.ts` (< 180 LOC)
  - `src/desk/arbitrage/self-evolving-ilp-constraints.ts` (< 180 LOC)
  - `src/desk/wiring/paper-trading-orchestrator.ts` (< 180 LOC)
- [ ] Phase 5: Verification, TypeScript Typecheck, and Test Suite Validation

## Dependencies
- Phase 1, Phase 2, Phase 3 are independent mathematical modules.
- Phase 4 touches 5 isolated desk files across polymarket, marl, arbitrage, and wiring.
- Phase 5 runs full typecheck (`npx tsc --noEmit`) and Vitest test suite.

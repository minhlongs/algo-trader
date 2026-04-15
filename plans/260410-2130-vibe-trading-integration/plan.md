> **Plan Status:** ARCHIVED — Concepts integrated into intelligence modules

# Vibe-Trading Concepts Integration Plan

## Source
Research: HKUDS/Vibe-Trading (FinAgent paper by Chao Huang, HKU)
Report: plans/reports/researcher-260410-vibe-trading-analysis.md

## Goal
Integrate 4 key Vibe-Trading innovations into algo-trader to reduce false positives by 30-40% (per FinAgent benchmarks) and enable dynamic strategy reconfiguration.

## Status
| Phase | Description | Status | Group |
|-------|-------------|--------|-------|
| 12 | Signal Consensus Swarm (3-agent debate) | pending | A (parallel) |
| 13 | Self-Evolving ILP Constraints | pending | A (parallel) |
| 14 | Vibe Controller (NATS mode switching) | pending | A (parallel) |
| 15 | Dual-Level Reflection Engine | pending | B (after 12) |

## Dependency Graph
```
Phase 12 (Swarm) ──────────┐
Phase 13 (Self-Evolving) ──┼──► Phase 15 (Dual Reflection)
Phase 14 (Vibe Controller) ┘
```

## Execution Strategy
1. **Parallel Group A**: Phases 12, 13, 14 — independent modules
2. **Sequential**: Phase 15 after Group A (needs swarm + ILP outputs)

## File Ownership Matrix
| Phase | Owns (exclusive) |
|-------|-----------------|
| 12 | src/intelligence/signal-consensus-swarm.ts |
| 13 | src/arbitrage/self-evolving-ilp-constraints.ts |
| 14 | src/wiring/vibe-controller.ts |
| 15 | src/intelligence/dual-level-reflection-engine.ts |

## Key Principle
Each concept = 1 file, < 200 lines. Wire into existing NATS topics + signal pipeline.

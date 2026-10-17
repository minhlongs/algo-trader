# Researcher Report: Desk Deep Modularization Audit (<180 LOC)

**Focus:** Decompose 5 oversized desk files exceeding 190 LOC down to < 180 LOC
**Target Files:**
1. `src/desk/polymarket/live-trading-orchestrator.ts` (196 LOC)
2. `src/desk/strategies/polymarket/smart-money-divergence.ts` (195 LOC)
3. `src/desk/marl/agents/multi-agent-coordinator.ts` (195 LOC)
4. `src/desk/arbitrage/self-evolving-ilp-constraints.ts` (195 LOC)
5. `src/desk/wiring/paper-trading-orchestrator.ts` (194 LOC)

---

## 1. `live-trading-orchestrator.ts` (196 LOC -> Target: < 160 LOC)
### Current Bloat Analysis
Contains order placement guards, orderbook fetching, strategy execution wrappers, price event bus subscription/unsubscription, and state persistence orchestration inline within a single monolithic class.
### Modularization Strategy
- Extract price update subscription logic & price-to-position mapping into `src/desk/polymarket/live-trading-event-subscriber.ts`.
- `LiveTradingOrchestrator` delegates price event handling to `LiveTradingEventSubscriber`.
- Consolidate inline query getters into concise expressions.
- Expected line count: ~145 LOC.

---

## 2. `smart-money-divergence.ts` (195 LOC -> Target: < 155 LOC)
### Current Bloat Analysis
Contains mathematical helpers (`computeSmartOBI`, `getTrendDirection`, `detectDivergence`), configuration defaults, and custom exit condition checks alongside the main strategy class.
### Modularization Strategy
- Extract pure mathematical detection functions (`computeSmartOBI`, `getTrendDirection`, `detectDivergence`) and default configuration into `src/desk/strategies/polymarket/smart-money-divergence-math.ts`.
- `smart-money-divergence.ts` imports and re-exports math functions for full backward compatibility.
- Expected line count: ~135 LOC.

---

## 3. `multi-agent-coordinator.ts` (195 LOC -> Target: < 160 LOC)
### Current Bloat Analysis
Houses quote proposal generation, three distinct quote aggregation algorithms (`aggregateBestQuote`, `aggregateWeightedAverage`, `aggregateConsensus`), and tick quantization inline.
### Modularization Strategy
- Extract quote aggregation algorithms (`aggregateBestQuote`, `aggregateWeightedAverage`, `aggregateConsensus`) into `src/desk/marl/agents/multi-agent-coordinator-aggregator.ts`.
- `MultiAgentCoordinator` maintains agent registry and delegates quote aggregation to `MultiAgentCoordinatorAggregator`.
- Expected line count: ~130 LOC.

---

## 4. `self-evolving-ilp-constraints.ts` (195 LOC -> Target: < 150 LOC)
### Current Bloat Analysis
Contains LLM prompt formatting, JSON parsing, constraint validation clamps (`HARD_MIN_EDGE`, `HARD_MAX_EXPOSURE`), and event publishing.
### Modularization Strategy
- Extract types (`MissedOpportunity`, `ConstraintSuggestion`, `EvolutionResult`, `CurrentConstraints`) and prompt parsing / clamping logic into `src/desk/arbitrage/self-evolving-ilp-types.ts` and `src/desk/arbitrage/self-evolving-ilp-prompt.ts`.
- Keep the evolution engine in `self-evolving-ilp-constraints.ts`.
- Expected line count: ~135 LOC.

---

## 5. `paper-trading-orchestrator.ts` (194 LOC -> Target: < 150 LOC)
### Current Bloat Analysis
Defines `PaperTrade`, `PaperPortfolio`, signal derivation functions, trade execution logic, and event handling within 194 lines.
### Modularization Strategy
- Extract core data types (`PaperTrade`, `PaperPortfolio`, `PaperSignalCandidate`) and `deriveSource` into `src/desk/wiring/paper-trading-types.ts`.
- Re-export all types from `paper-trading-orchestrator.ts` to preserve zero breaking changes across existing callers.
- Expected line count: ~140 LOC.

---

## Summary of Targeted Reductions
| File | Current LOC | Extracted Submodule | Target LOC |
|---|---|---|---|
| `live-trading-orchestrator.ts` | 196 | `live-trading-event-subscriber.ts` | ~145 |
| `smart-money-divergence.ts` | 195 | `smart-money-divergence-math.ts` | ~135 |
| `multi-agent-coordinator.ts` | 195 | `multi-agent-coordinator-aggregator.ts` | ~130 |
| `self-evolving-ilp-constraints.ts` | 195 | `self-evolving-ilp-prompt.ts` | ~135 |
| `paper-trading-orchestrator.ts` | 194 | `paper-trading-types.ts` | ~140 |

## Unresolved Questions
None. All 5 refactors preserve complete public APIs and backward-compatible exports.

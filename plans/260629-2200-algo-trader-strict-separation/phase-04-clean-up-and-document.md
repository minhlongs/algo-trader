---
phase: 4
title: "Clean Up and Document"
status: pending
priority: P2
effort: "2 weeks"
dependencies: [3]
---

# Phase 4: Clean Up and Document

## Overview

Refactor 20+ copy-paste Polymarket strategies into base class + config. Split oversized files (>200 lines). Delete dead code. Write Architecture Decision Records. Update roadmap, manifesto, and changelog. Final quality gate.

## TDD Gate (Tests First)

**Before refactoring strategies, write tests for the base class contract:**

1. `tests/unit/strategy-base-class-contract.test.ts` — verify IStrategy interface methods: `analyze()`, `execute()`, `getName()`, `getConfig()`
2. `tests/unit/polymarket-strategy-factory.test.ts` — verify factory creates strategies from config with correct behavior
3. For each strategy being refactored: one characterization test that pins current behavior before refactoring

These tests ensure refactored strategies produce identical signals to the originals.

## Requirements

### Functional
- Refactor 20+ Polymarket strategy files from ~450 lines each to config-driven (~100 lines each)
- Split files >200 lines: audit service (795), referral repo (583), marketplace routes (516), xai routes (515)
- Delete dead code: modules with zero imports, unused exports, abandoned experiments
- Write ADRs for boundary decisions
- Update roadmap, manifesto (add platform footnote), changelog

### Non-Functional
- All existing 2,214+ tests must pass with refactored code
- Refactored strategies must produce identical signals to originals (verified by characterization tests)
- Zero files >200 lines in `src/desk/` and `src/platform/` after split
- Docs must be bilingual where customer-facing

## Architecture

### Strategy Refactoring Pattern

**Before (copy-paste, 450 lines each × 20 files = ~9,000 lines):**
```typescript
// vwap-deviation-sniper.ts (~450 lines)
export class VwapDeviationSniper implements IStrategy {
  name = 'vwap-deviation-sniper';
  async analyze(market: Market): Promise<Signal | null> {
    // 100+ lines of analysis logic, 90% identical to other strategies
  }
  async execute(signal: Signal): Promise<TradeResult> {
    // 100+ lines of execution, 90% identical
  }
  // 200+ lines of shared utilities copy-pasted
}
```

**After (base class + config, ~100 lines per strategy × 20 = ~2,000 lines + 300-line base):**
```typescript
// desk/strategies/polymarket/base-strategy.ts (~300 lines, ONCE)
export abstract class BasePolymarketStrategy implements IStrategy {
  abstract config: StrategyConfig;
  async analyze(market: Market): Promise<Signal | null> {
    return this.executeAnalysis(market, this.config.indicators);
  }
  async execute(signal: Signal): Promise<TradeResult> {
    return this.executeTrade(signal, this.config.execution);
  }
  protected executeAnalysis(market: Market, indicators: IndicatorConfig[]): Promise<Signal | null> {
    // Shared analysis logic — written once
  }
  protected executeTrade(signal: Signal, execConfig: ExecutionConfig): Promise<TradeResult> {
    // Shared execution logic — written once
  }
}

// desk/strategies/polymarket/vwap-deviation-sniper.ts (~100 lines)
export class VwapDeviationSniper extends BasePolymarketStrategy {
  config: StrategyConfig = {
    name: 'vwap-deviation-sniper',
    indicators: [
      { type: 'VWAP', period: 20, deviation: 2.0 },
      { type: 'VOLUME', threshold: 1.5 }
    ],
    execution: { maxSlippage: 0.005, ttl: 30000 },
    risk: { kellyFraction: 0.25, maxDrawdown: 0.15 }
  };
}
```

### File Split Targets

| File | Current Lines | Target Lines | Approach |
|------|-------------|-------------|----------|
| `ai-decision-audit-service.ts` | 795 | 3 files × ~200 | Split into audit-logger, audit-querier, audit-reporter |
| `referral-repository.ts` | 583 | 3 files × ~150 | Split into referral-crud, referral-analytics, referral-validation |
| `marketplace-strategy-routes.ts` | 516 | 3 files × ~170 | Split by route group: listings, subscriptions, reviews |
| `xai-routes.ts` | 515 | 3 files × ~170 | Split by endpoint: completions, embeddings, admin |
| `prometheus-metrics.ts` | 443 | 2 files × ~200 | Split into metrics-registry, metrics-middleware |
| `paper-executor.ts` | 449 | 2 files × ~200 | Split into paper-executor, paper-position-tracker |
| 20+ strategy files | ~450 each | ~100 each (config-driven) | Base class extraction |

### Dead Code Candidates
- `ironclaw/` — verify if active or abandoned experiment
- `citadel/` — verify if active or abandoned experiment
- Any module with zero imports from other modules (orphaned code)
- Unused exports in barrel files
- Duplicate migration files (021 duplicate prefix, 025 duplicate prefix)

## Related Code Files

### Create
- `src/desk/strategies/polymarket/base-strategy.ts`
- `src/desk/strategies/polymarket/strategy-factory.ts`
- `src/desk/strategies/polymarket/configs/` (20 strategy config files)
- `docs/architecture/decisions/` (ADR directory)
- `docs/architecture/decisions/001-shared-kernel-boundary.md`
- `docs/architecture/decisions/002-desk-platform-separation.md`
- `docs/architecture/decisions/003-strategy-ownership-model.md`
- `docs/architecture/decisions/004-tenant-isolation-pattern.md`
- `docs/platform-doctrine.md`
- `tests/unit/strategy-base-class-contract.test.ts`
- `tests/unit/polymarket-strategy-factory.test.ts`

### Modify
- 20+ strategy files: refactor to extend base class
- `docs/manifesto.md`: add footnote acknowledging platform separation
- `docs/development-roadmap.md`: update to reflect post-separation reality
- `docs/project-changelog.md`: add separation entry
- `docs/system-architecture.md`: update architecture diagram
- `CLAUDE.md`: update module layout section

### Delete
- Dead code modules (TBD after audit)
- Duplicate migration files (if confirmed safe)
- Old barrel exports pointing to moved files

## Implementation Steps

### Step 1: TDD Gate — Strategy Contract Tests (Day 1-2)
1. Write `strategy-base-class-contract.test.ts` — define IStrategy contract
2. Write `polymarket-strategy-factory.test.ts` — verify factory pattern
3. Write characterization tests for top 5 most-used strategies:
   - `vwap-deviation-sniper.char.test.ts`
   - `whale-tracker.char.test.ts`
   - `bollinger-squeeze.char.test.ts`
   - `momentum-cascade.char.test.ts`
   - `cross-correlation-lag.char.test.ts`
4. Each characterization test: feed known market data → verify signal output matches current behavior exactly

### Step 2: Refactor Strategies (Day 2-5)
1. Extract `BasePolymarketStrategy` from common code across 20 files
2. Identify shared patterns: analysis pipeline, execution flow, risk checks
3. Create `StrategyConfig` interface for config-driven behavior
4. Convert each strategy to config + thin subclass
5. Run characterization tests after each strategy refactor
6. If any test fails: the refactor changed behavior — fix or revert

### Step 3: Split Oversized Files (Day 5-8)
For each target file:
1. Read and understand all functionality
2. Identify natural split boundaries (different concerns/responsibilities)
3. Create new files following kebab-case naming
4. Move functions/classes to appropriate files
5. Update imports in all consumers
6. Run tests after each split
7. Delete old file

### Step 4: Dead Code Audit (Day 8-9)
1. Run `ts-prune` or grep for unused exports
2. Check `ironclaw/` and `citadel/` — imported by anything?
3. Remove orphaned modules (confirm with git log for original purpose)
4. Clean up duplicate migration prefixes
5. Run full test suite after deletions

### Step 5: Write ADRs and Update Docs (Day 9-12)
1. Write ADR-001: Shared kernel boundary and import rules
2. Write ADR-002: Desk/platform separation rationale
3. Write ADR-003: Strategy ownership model (desk owns all)
4. Write ADR-004: Tenant isolation pattern
5. Update `docs/manifesto.md` — add footnote:
   > *June 2026: The codebase is now organized into desk/ (solo proprietary trading — this manifesto) and platform/ (RaaS subscriber infrastructure). The manifesto governs desk/. Platform subscribers access strategies via tier-gated config without modifying desk code.*
6. Update `docs/development-roadmap.md`:
   - Mark Phases 34-37 with new post-separation status
   - Add separation as completed milestone
   - Update timeline to reflect current date
7. Update `docs/project-changelog.md` — add separation entry
8. Update `docs/system-architecture.md` — new 3-context diagram
9. Update `CLAUDE.md` — new module layout

### Step 6: Final Gate Check (Day 12-14)
1. `pnpm test` — all tests pass (original + new contract + characterization)
2. `pnpm typecheck` — zero errors
3. `pnpm lint` — under 100 warnings
4. Verify: zero files >200 lines in `src/desk/` and `src/platform/`
5. Verify: strategy characterization tests match original behavior
6. Verify: all ADRs present and linked from docs index
7. Final review: read all changed files, verify coherence

## Success Criteria

- [ ] Strategy contract tests pass (base class + factory + 5 characterization tests)
- [ ] 20+ Polymarket strategies refactored to base class + config
- [ ] Strategy characterization tests prove identical signal output
- [ ] All files >200 lines split (7 targets, ~18 new files)
- [ ] Dead code deleted (orphaned modules, duplicate migrations, unused exports)
- [ ] 4 ADRs written in `docs/architecture/decisions/`
- [ ] `docs/manifesto.md` updated with platform footnote
- [ ] `docs/development-roadmap.md` updated with post-separation status
- [ ] `docs/project-changelog.md` updated
- [ ] `docs/system-architecture.md` updated with new diagram
- [ ] `CLAUDE.md` updated with new module layout
- [ ] `pnpm test` passes — all tests (original + new)
- [ ] `pnpm typecheck` passes — zero errors
- [ ] Zero files >200 lines in desk/ and platform/

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Strategy refactoring changes trading behavior | Medium | Characterization tests pin exact signal output; CI gate fails on mismatch |
| Dead code deletion breaks something | Medium | Check imports before deletion; run full suite after each removal |
| ADR decisions conflict with future plans | Low | ADRs document current state; can be superseded later |
| Documentation update misses a file | Medium | Checklist of all docs to update; review each before commit |

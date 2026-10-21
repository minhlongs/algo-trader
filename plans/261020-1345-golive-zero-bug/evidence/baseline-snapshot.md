# Baseline Snapshot — go-live zero-bug

**Captured:** 2026-10-20T08:44:37Z
**Plan:** plans/261020-1345-golive-zero-bug/

## Git state

```
branch:    feat/triad-apex-deep-refactor-wave180-182
local SHA: 5e263d300c4c9896b3a14cecc35ab5eb43aa86cf
short:     5e263d30
```

## Live production SHA

```
{"sha":"bca78f2e6bcee0283b710fefed741bfda262afcc","service":"algo-trader","arch":"cf-only"}
```

**Delta:** production runs a known-ancestor commit, not local HEAD.

## Working tree

65 changed files.

```
 M .claude/agent-memory/suntzu/MEMORY.md
 M docs/project-changelog.md
 M src/alpha-lab/experiments/multi-regime-candle-generator.ts
 M src/alpha-lab/pipeline/alpha-lab-pipeline-promoter.ts
 M src/alpha-lab/regimes/regime-engine.ts
 M src/alpha-lab/run-experiment.ts
 M src/db/d1-postgres-metering-sync.ts
 M src/db/trade-repository.ts
 M src/desk/arbitrage/profitability/slippage-calculator.ts
 M src/desk/arbitrage/risk/arbitrage-risk-guard-exposure.ts
 M src/desk/arbitrage/risk/arbitrage-risk-guard.ts
 M src/desk/commands/desk-auto.ts
 M src/desk/daemon/engine-supervisor.ts
 M src/desk/gate/validators.ts
 M src/desk/intelligence/semantic-similarity-search.ts
 M src/desk/jobs/social-auto-poster.ts
 M src/desk/markets/cex/ccxt-connector-mappers.ts
 M src/desk/marl/environment/orderbook-normalizer.ts
 M src/durable-objects/strategy-shard-state.ts
 M src/durable-objects/strategy-shard.ts
 M src/platform/ab-testing/ab-test-manager.ts
 M src/platform/billing/license-service.ts
 M src/platform/billing/revenue-analytics.ts
 M src/platform/db/trade-repository.ts
 M src/platform/marketplace/notifications/notification-service.ts
 M src/platform/marketplace/repositories/revenue-share-repository.ts
 M src/platform/marketplace/services/badge-service.ts
 M src/platform/risk/drawdown-monitor-evaluators.ts
 M src/platform/workers/coupon-helpers.ts
 M src/regions/region-health-monitor.ts
?? .claude/agent-memory/suntzu/project_s18_oversized_debt_tranche50_shipped.md
?? plans/261020-0809-deep-modularization-160-to-158/
?? plans/261020-1345-golive-zero-bug/
?? plans/reports/binh-phap-20261020-golive-readiness-scout.md
?? plans/reports/brainstorm-20261018-wave62-hotspot-refactor-deep.md
?? src/alpha-lab/experiments/multi-regime-candle-shaping.ts
?? src/alpha-lab/pipeline/alpha-lab-pipeline-signal-gate.ts
?? src/alpha-lab/regimes/regime-default-rules.ts
?? src/alpha-lab/run-experiment-artifact.ts
?? src/db/metering-sync-queries.ts
?? src/db/trade-sql-statements.ts
?? src/desk/arbitrage/profitability/slippage-book-walk.ts
?? src/desk/arbitrage/risk/arbitrage-exposure-legs.ts
?? src/desk/arbitrage/risk/arbitrage-risk-guard-factory.ts
?? src/desk/commands/desk-auto-stub-daemon.ts
?? src/desk/daemon/supervised-engine-normalizers.ts
?? src/desk/gate/tier-quota.ts
?? src/desk/intelligence/semantic-similarity-scoring.ts
?? src/desk/jobs/social-channel-posters.ts
?? src/desk/markets/cex/ccxt-error-classifier.ts
?? src/desk/marl/environment/orderbook-level-normalizer.ts
?? src/durable-objects/strategy-shard-identity.ts
?? src/durable-objects/strategy-shard-loader.ts
?? src/platform/ab-testing/ab-test-model.ts
?? src/platform/billing/license-record-factory.ts
?? src/platform/billing/revenue-license-metrics.ts
?? src/platform/marketplace/notifications/notification-retry-policy.ts
?? src/platform/marketplace/repositories/revenue-share-query-builder.ts
?? src/platform/marketplace/services/badge-quality-rules.ts
?? src/platform/risk/drawdown-threshold-evaluator.ts
?? src/platform/workers/coupon-invoice-client.ts
?? src/platform/workers/coupon-kv-store.ts
?? src/platform/workers/coupon-lifecycle-rules.ts
?? src/platform/workers/coupon-model.ts
?? src/regions/region-failover-selection.ts
```

---

## Phase 01 gate results (all captured 2026-10-20T08:57:01Z)

```
typecheck (tsc --noEmit)              exit 0
quality-baseline --quality            5/5 PASS
lint (eslint src)                     0 errors, 149 warnings (all pre-existing)
vitest run (full)                     17122 passed / 11 skipped, 0 failed, 1343 files
```

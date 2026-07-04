# Brainstorm: Fix Integration Test Failures from File Splitting

## Problem
Phase 4 file splitting moved Prometheus metric declarations from `prometheus-metrics.ts` to `prometheus-metrics-definitions.ts`. 10 integration/sync discipline tests reference the old path and find 0 declarations → 25 test failures.

## Root Cause
Tests declare `const METRICS_PATH = resolve(..., 'prometheus-metrics.ts')` then regex-parse the file for metric names, label enums, HELP text, etc. The declarations now live in `-definitions.ts`.

## Fix
Single path change in each of 10 test files: point `METRICS_PATH` to `prometheus-metrics-definitions.ts`.

## Impact
- 25 tests restored to passing
- 8 pre-existing marketplace-route test failures remain (unrelated)
- Zero risk — tests only read source files, no runtime behavior changes

## Files to modify (10)
1. `tests/integration/prometheus-metric-naming-discipline-sync.test.ts`
2. `tests/integration/qwen-kill-switch-source-enum-sync.test.ts`
3. `tests/integration/qwen-signals-total-result-enum-sync.test.ts`
4. `tests/integration/admin-qwen-kill-action-enum-sync.test.ts`
5. `tests/integration/qwen-signals-loop-decision-enum-sync.test.ts`
6. `tests/integration/prometheus-histogram-bucket-structural-sync.test.ts`
7. `tests/integration/runbook-metric-references.test.ts`
8. `tests/integration/grafana-dashboard-provisioning.test.ts`
9. `tests/integration/grafana-alert-provisioning.test.ts`
10. `tests/integration/strategy-review-status-enum-sync.test.ts`

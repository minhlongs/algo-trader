# Data Infrastructure — Completion Report

**Date:** 2026-08-14
**Status:** COMPLETE — all 3 modules implemented, migrations registered, TypeScript compiles

## Summary

Built three data infrastructure modules: Historical OHLCV Store, A/B Testing Framework, Model Registry. All backed by PostgreSQL, all files under 200 lines.

## 1. Historical OHLCV Store

**Files:**
- `src/db/migrations/045-ohlcv-candles.ts` (45 lines)
- `src/desk/data/ohlcv-store.ts` (194 lines)

**Schema:** `ohlclv_candles` table with composite unique index on (market, exchange, timeframe, timestamp). Columns: market, exchange, timeframe, timestamp, open, high, low, close, volume.

**API:**
- `storeCandle(candle)` — single upsert
- `bulkInsertCandles(candles)` — batched upsert (500 per batch)
- `getHistoricalData(market, timeframe, start, end)` — range query
- `getLatestCandles(market, timeframe, limit)` — latest N candles
- `getCandleCount(market, timeframe)` — count stored candles

**Backtest Integration:** Modified `backtest-runner.ts` to accept optional `ohlcvMarket` and `ohlcvTimeframe` config fields. When set, fetches from OHLCV store instead of live Gamma API. Falls back to Gamma API on empty store.

## 2. A/B Testing Framework

**Files:**
- `src/db/migrations/046-ab-test-experiments.ts` (77 lines)
- `src/platform/ab-testing/ab-test-manager.ts` (174 lines)
- `src/platform/ab-testing/ab-test-stats.ts` (63 lines)
- `src/platform/ab-testing/ab-test-routes.ts` (79 lines)

**Schema:** 3 tables — `ab_test_experiments`, `ab_test_assignments`, `ab_test_outcomes`. Experiments track control/treatment groups with status lifecycle (draft -> running -> paused -> completed -> archived).

**API (manager):**
- `createExperiment(params)` — create in draft
- `startExperiment(id)` — activate
- `assignGroup(experimentId, signalId)` — deterministic hash-based assignment
- `recordOutcome(experimentId, signalId, group, correct, ...)` — record result
- `getResults(experimentId)` — two-proportion z-test with p-value, significance, winner recommendation
- `listExperiments()` — list all

**Routes (Hono):**
- `GET /ab-test/experiments` — list
- `POST /ab-test/experiments` — create
- `POST /ab-test/experiments/:id/start` — activate
- `POST /ab-test/experiments/:id/assign` — assign group
- `POST /ab-test/experiments/:id/outcome` — record outcome
- `GET /ab-test/experiments/:id/results` — significance results

**Stats:** Two-proportion z-test (Abramowitz & Stegun normal CDF approximation). Minimum sample check, recommendation builder.

## 3. Model Registry

**Files:**
- `src/db/migrations/047-model-registry.ts` (50 lines)
- `src/desk/ml/model-registry.ts` (179 lines)

**Schema:** `model_registry` table. Columns: model_name, version, status (registered/staging/production/archived/failed), metrics (JSONB), training_data_hash, artifact_path, hyperparameters (JSONB), model_type, registered_by, promoted_at. Unique on (model_name, version).

**API:**
- `registerModel(params)` — register new version
- `getLatestVersion(modelName, status?)` — latest by name
- `getModelVersions(modelName)` — all versions
- `compareVersions(modelName, versions[])` — side-by-side comparison with bestByAccuracy/bestByF1
- `promoteModel(modelName, version)` — promote to production (auto-archives previous)

## Migration Registration

All 3 migrations added to `src/db/migration-runner.ts`:
- `migration045` (OHLCV candles)
- `migration046` (A/B experiments)
- `migration047` (model registry)

## TypeScript Compilation

`npx tsc --noEmit` — zero errors from new/modified files. Pre-existing errors in `strategy-registry-full.ts` and `polymarket-adapter.ts` remain unchanged.

## Files Modified

| File | Change |
|------|--------|
| `src/desk/backtesting/backtest-runner.ts` | Added OHLCV import, optional store-based fetch, `fetchFromOhlcvStore()` method |
| `src/db/migration-runner.ts` | Added 3 migration imports and array entries |

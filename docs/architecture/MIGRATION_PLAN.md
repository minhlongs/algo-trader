# MIGRATION_PLAN — remaining deltas and the no-wholesale-migration rule

> Increment S12 · audited 2026-08-26 · supersedes all prior migration planning.

## The rule

**No further wholesale migration; remaining deltas = 74-tool MCP (YAGNI-deferred), factor zoo (YAGNI-deferred). DERIV data source delta CLOSED in S12 (P32 done-with-honest-reject).**

The 34-phase master command assumed a fresh migration of `HKUDS/Vibe-Trading`. The S11 audit (recon: `plans/reports/researcher-vibe-trading-recon-20260826.md`) proved the repo already covers the master command's intent through S1–S10 + CashClaw evolution. Everything not covered is now explicitly KEEP/ADAPT/REJECT/DEFERRED in `MODULE_MAPPING.md` — documented, not built.

## Remaining deltas (exhaustive)

### 1. DERIV data source — CLOSED in S12 (P32 done-with-honest-reject)

- Master-command P32 wanted a funding-rate mean-reversion E2E.
- Former blocker (no funding/OI historical data source) removed in S12: real Binance Futures funding feed (`src/desk/data/binance-funding-feed.ts`) → Postgres store (`src/desk/data/funding-store.ts`, migration `src/db/migrations/049-funding-rates.ts`); 4380 BTCUSDT rows, 2022-08-27 → 2026-08-26, zero null provenance.
- P32 acceptance ran on this real data and recorded an HONEST REJECT (`alphaSurvival:false`, ledger chained): the triple-barrier strategy cannot monetize the measured mean-reversion (lag-1 Δbps autocorrelation −0.298) at 7bps round-trip cost. Valid completion per the validation doctrine — either sign passes the honesty bar.
- Open-interest data remains absent; any future OI work is new product work, not migration.

### 2. 74-tool MCP suite — YAGNI-deferred

- Upstream `agent/mcp_server.py` exposes 74 tools. This repo ships 4 high-value read-only tools in `src/platform/mcp/research-mcp-server.ts` (S5; `readOnlyHint` annotations added S11).
- More tools only when a real consumer exists. Deferred in `MIGRATION_LOG.json`.

### 3. Full factor zoo — YAGNI-deferred

- Upstream `agent/src/factors/zoo/` (alpha101, gtja191, qlib158, academic, fundamental).
- Repo equivalent: `src/alpha-lab/alpha-discovery/strategy-family-registry.ts` + `strategy-families.ts` + `src/alpha-lab/features/`. Porting the zoo duplicates the registry. Deferred in `MIGRATION_LOG.json`.

## Standing deferrals (unchanged, from MIGRATION_LOG.json)

| Item | Reason |
|---|---|
| Multi-asset backtest engines | crypto + prediction markets only; porting = dead code |
| 40+ data loaders | only Binance/CCXT needed; secret surface + maintenance |
| Shadow-account broker reconciliation | needs a real statement schema; ~80% covered by paper tracker |
| Frontend / desktop upstream | existing `dashboard/` sufficient |
| 90 finance skills | CN/US-equity skills are dead code here |
| LLM provider routing | deterministic TS pipeline; no LLM-in-the-loop |

## What S11 closed (not deferred)

| Gap | Closure | Evidence |
|---|---|---|
| P1 architecture docs (false S1 claim) | 9 docs created in this directory | `ls docs/architecture/*.md` |
| P14 MCP readOnlyHint | annotations on all 4 tools | `src/platform/mcp/research-mcp-server.ts` |
| P31 system doctor | `cashclaw doctor` (5 checks) | `src/desk/cli/system-doctor.ts` |
| G1 EXTREME stress mode | 4th preset, `listStressModes()` returns 4 | `src/alpha-lab/cost-model/cost-stress.ts` |

## What S12 closed (not deferred)

| Gap | Closure | Evidence |
|---|---|---|
| P32 funding-rate acceptance (DERIV delta) | real funding feed + store + calibration + adapter wiring; E2E honest REJECT on 4380 real bars | `src/desk/data/binance-funding-feed.ts`, `src/desk/data/funding-store.ts`, `src/db/migrations/049-funding-rates.ts`, `src/alpha-lab/configs/funding-mean-reversion-btc-8h.json`, `scripts/calibrate-funding.ts` |
| G2 promotion-state-machine tests | 20 dedicated tests | `src/alpha-lab/attribution/__tests__/promotion-state-machine.test.ts` |
| G3 PAPER_TRADES_API env override | doctor reads env with default fallback | `src/desk/cli/system-doctor-defaults.ts` |
| G4 MODULE_MAPPING path legend | bare = repo-relative, `agent/`/`frontend/` = upstream-relative, `file:` tolerated | `docs/architecture/MODULE_MAPPING.md` §"Path convention legend" |
| G5 robustness effective cost | `applyStressToBaselineConfig` folds spread; `EffectiveRT(bps)` column + `effectiveRoundTripBps` JSON field; EXTREME live-verified = 100bps | `src/desk/cli/alpha-robustness-handler.ts` |

## Resumption rule for future sessions

Any future work touching these deltas must: (1) cite this file, (2) add a new phase to `MIGRATION_LOG.json` with targetFiles + test evidence, (3) never re-open a REJECT without new product evidence. The deferred list in `MIGRATION_LOG.json` is append-only.

## See also

- `MIGRATION_STATUS.md` — per-phase state
- `MODULE_MAPPING.md` — full 34-row verdict table
- Root `MIGRATION_COMPLETE.md` — reconciliation statement

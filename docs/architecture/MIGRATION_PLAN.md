# MIGRATION_PLAN — remaining deltas and the no-wholesale-migration rule

> Increment S11 · audited 2026-08-26 · supersedes all prior migration planning.

## The rule

**No further wholesale migration; remaining deltas = DERIV data source (blocked), 74-tool MCP (YAGNI-deferred), factor zoo (YAGNI-deferred).**

The 34-phase master command assumed a fresh migration of `HKUDS/Vibe-Trading`. The S11 audit (recon: `plans/reports/researcher-vibe-trading-recon-20260826.md`) proved the repo already covers the master command's intent through S1–S10 + CashClaw evolution. Everything not covered is now explicitly KEEP/ADAPT/REJECT/DEFERRED in `MODULE_MAPPING.md` — documented, not built.

## Remaining deltas (exhaustive)

### 1. DERIV data source — BLOCKED

- Master-command P32 wants a funding-rate mean-reversion E2E.
- Blocker: no funding/OI historical data source exists anywhere in the repo. `grep -rl fundingRate\|openInterest src/desk/data/` = empty; `src/desk/data/` holds candles + sentiment only; `funding-rate-arb.ts` infers funding from the order book.
- Status: DERIV DEFERRED (standing escrow). Honest substitute acceptance: `rsi-mean-reversion-btc-1h` E2E with `dataSource === 'real'` (plan B4).
- Unblocks only when a real funding/OI feed is added — that is new product work, not migration.

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

## Resumption rule for future sessions

Any future work touching these deltas must: (1) cite this file, (2) add a new phase to `MIGRATION_LOG.json` with targetFiles + test evidence, (3) never re-open a REJECT without new product evidence. The deferred list in `MIGRATION_LOG.json` is append-only.

## See also

- `MIGRATION_STATUS.md` — per-phase state
- `MODULE_MAPPING.md` — full 34-row verdict table
- Root `MIGRATION_COMPLETE.md` — reconciliation statement

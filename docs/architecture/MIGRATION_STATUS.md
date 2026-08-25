# MIGRATION_STATUS — per-phase state of the master command

> Increment S11 · audited 2026-08-26 · machine-readable companion: `MIGRATION_LOG.json` (repo root)
> Source of truth: `plans/reports/researcher-vibe-trading-recon-20260826.md` (34-row gap table).

## Shipped increments (S1–S11)

| Increment | Deliverable | Evidence (real paths) | Status |
|---|---|---|---|
| S1 | Recon + architecture freeze | 9 docs claimed but ABSENT until S11 — corrected in `MIGRATION_LOG.json` (`correctedBy: "S11"`) | CORRECTED |
| S2 | Data quality gate + candle contracts | `src/desk/data/data-quality-gate.ts`, `src/desk/data/candle-contracts.ts`, `src/desk/data/quality-metrics.ts` | DONE |
| S3 | Provenance ledger, run cards, statistical validation | `src/alpha-lab/provenance/research-ledger.ts`, `src/alpha-lab/validation/monte-carlo-permutation.ts`, `src/alpha-lab/validation/bootstrap-sharpe.ts` | DONE |
| S4 | Execution safety hardening | `src/desk/execution/execution-mode.ts`, `src/desk/sandbox/strategy-static-scanner.ts`, `src/desk/execution/live-order-manager.ts` | DONE |
| S5 | Research MCP server (4 read-only tools) | `src/platform/mcp/research-mcp-server.ts`, `src/api/routes/mcp-routes.ts` | DONE |
| S6 | Machine-readable migration log + docs | `MIGRATION_LOG.json`, `docs/vibe-trading-migration.md` | DONE |
| S7 | Research feedback loop (verdict recording) | `src/alpha-lab/provenance/record-alpha-verdict.ts`, `src/alpha-lab/run-experiment.ts` | DONE |
| S8 | Research-informed prioritization | `src/alpha-lab/alpha-discovery/research-informed.ts`, `src/alpha-lab/provenance/verdict-summary.ts` | DONE |
| S9 | Regime-aware research artifacts | `src/alpha-lab/regimes/regime-engine.ts`, `src/alpha-lab/regimes/regime-series.ts` | DONE |
| S10 | Alpha gap-closure (E7/F2) | deploy path `scripts/deploy-cloudflare.sh`; escrow G1 carried | DONE |
| S11 | Master command audit + gap-closure | 9 architecture docs (this dir), MCP `readOnlyHint`, `src/desk/cli/system-doctor.ts`, EXTREME stress mode | THIS INCREMENT |

## Master-command phases vs reality (34-phase audit summary)

Full table: `MODULE_MAPPING.md` §"Audit 2026-08-26". Summary by verdict:

| Verdict | Count | Phases |
|---|---|---|
| DONE / PORT | 8 | P4, P8, P10, P12, P13, P14 (S11), P16, P31 (S11) |
| COVERED (KEEP/ADAPT) | 15 | P3, P7 (partial), P9, research pipeline, swarm, market-data, portfolio, risk, attribution, persistence, security, observability, CLI, API, channels |
| DEFERRED (standing) | 5 | factor zoo, 74-tool MCP, multi-asset engines, 40+ loaders, shadow-account reconciliation |
| REJECTED | 4 | 90 finance skills, LLM provider routing, frontend, desktop |
| BLOCKED | 1 | P32 funding-rate acceptance — no funding/OI data source exists |

## Open escrow after S11

| Item | State | Reason |
|---|---|---|
| G1 EXTREME stress preset | CLOSED in S11 | `src/alpha-lab/cost-model/cost-stress.ts` now lists 4 modes via `listStressModes()` |
| DERIV data source (funding/OI) | DEFERRED | `grep -rl fundingRate\|openInterest src/desk/data/` = empty; `funding-rate-arb.ts` infers from order book only |
| S1 doc debt | CLOSED in S11 | 9 architecture docs created; log entry corrected |

## Deferred items (unchanged, from MIGRATION_LOG.json)

1. Multi-asset backtest engines — repo is crypto + prediction markets only.
2. 40+ data loaders — only Binance/CCXT needed; each loader adds secret surface.
3. Shadow-account broker-statement reconciliation — needs a real statement schema.
4. Full 74-tool MCP suite — 4 read-only tools shipped; more only with a real consumer (YAGNI).
5. Full factor zoo — duplicates `src/alpha-lab/alpha-discovery/strategy-family-registry.ts` (YAGNI).
6. Frontend / desktop upstream — existing `dashboard/` sufficient.
7. MASTER COMMAND phases 5–34 — reconciled as covered/deferred in S11, not ported wholesale.

## See also

- `MIGRATION_PLAN.md` — remaining deltas and the no-wholesale-migration rule
- `MODULE_MAPPING.md` — full 34-row mapping with real paths
- Root `MIGRATION_COMPLETE.md` — reconciliation statement ("master command reconciled", not "migration complete")

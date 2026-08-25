# SECURITY_MODEL — fail-closed execution and research integrity

> Increment S11 · audited 2026-08-26 · all paths verified on disk.
> Doctrine: "AI proposes. Research validates. Risk disposes. Execution obeys only approved policy."

## 1. Execution mode gate (the core control)

`src/desk/execution/execution-mode.ts` — 95 lines, single source of truth:

- `ExecutionMode = 'READ_ONLY' | 'PAPER' | 'LIVE'` (:25).
- LIVE requires the **literal env string** `LIVE_TRADING_ENABLED=true`; anything else — empty, `"1"`, `"yes"`, undefined — resolves to READ_ONLY (:47-49). No code path sets it.
- Helpers: `isLiveEnabled()` (:55), `isReadOnly()` (:65); live attempts in READ_ONLY throw with an explicit message (:78, :91).

This is stronger than upstream's `agent/src/live/enforcement.py` + `order_guard.py` (MODULE_MAPPING row 18, verdict PORT).

## 2. CI paper-gate-lock (Gate 6)

`scripts/ci-gate-paper-gate-lock.sh` — static scan ensuring the live-eligibility marker never appears assigned in tracked files. Runs pre-push and in CI. Complements the runtime gate with a repo-level invariant.

## 3. Strategy sandbox

`src/desk/sandbox/strategy-static-scanner.ts` (S4) — static analysis of generated strategy code before execution; pairs with the WASM sandbox boundary. Zero unguarded live-submit paths were enumerated in S4 (4 paths, all gated).

## 4. Encryption boundary

`src/forest/rate-limit/docs/encryption-boundary.md` — documents where secrets are encrypted at rest and the boundary between encrypted and plaintext zones. Secrets live in environment config only; never in code or commits (CI Gate 2 secret scan: `scripts/ci-gate-secret-scan.mjs`).

## 5. Auth

`src/platform/auth/` — authentication for the HTTP surface (`src/api/routes/`, `src/app.ts`). MCP research tools are additionally tier-gated (PRO) in `src/platform/mcp/research-mcp-server.ts`.

## 6. MCP read-only declarations (S11)

`src/platform/mcp/research-mcp-server.ts` — all 4 tools (list_experiments, get_run_card, get_alpha_report, get_backtest_summary) now carry `annotations: { readOnlyHint: true }` (:84 and siblings), matching the SDK's `readOnlyHint` contract. Clients can verify the tools cannot mutate state.

## 7. Research integrity controls

- **Provenance**: hash-chained ledger `src/alpha-lab/provenance/research-ledger.ts`; every run card carries a config hash (`run-card.ts`). No performance number exists without a ledger entry.
- **Result classification**: IS / OOS / PAPER / LIVE distinguished via the `ResultClass` union; artifacts label `dataSource` (`src/alpha-lab/run-experiment.ts:153`) and acceptance requires `dataSource === 'real'`.
- **Promotion gate**: `src/alpha-lab/attribution/promotion-state-machine.ts` — LIVE_APPROVED is a state, but live order submission remains independently blocked by §1.
- **Quality ratchet**: `quality-baseline.json` + `scripts/check-quality-baseline.mjs` (Gate 8) — anyTypes, console calls, banned imports, coverage floors can only improve.

## 8. CI gate stack (relevant to security)

| Gate | Script | Purpose |
|---|---|---|
| 2 | `scripts/ci-gate-secret-scan.mjs` | secret scan + audit |
| 6 | `scripts/ci-gate-paper-gate-lock.sh` | live-eligibility marker never assigned |
| 8 | `scripts/check-quality-baseline.mjs --all` | ratchet floors |

## Threat model summary

| Asset | Control |
|---|---|
| Real funds | literal env gate (§1) + paper-gate-lock (§2) + gated submit paths (§3) |
| API keys/credentials | env-only + secret scan + encryption boundary (§4) |
| Research truth | provenance chain + result classification + dataSource label (§7) |
| MCP consumers | readOnlyHint + tier gate (§5, §6) |

## See also

- `MODULE_MAPPING.md` rows 18, 24 — upstream security equivalents
- `DATA_FLOW.md` stage 6 — promotion state machine
- `MIGRATION_PLAN.md` — what remains deferred

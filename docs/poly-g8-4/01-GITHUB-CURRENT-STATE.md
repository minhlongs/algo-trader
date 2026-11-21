# POLY-G8.4 — GitHub Current State & Source-Truth Snapshot

- **Document ID:** `POLY-G8.4-01`
- **Date:** 2026-11-21 (Asia/Saigon)
- **Repository:** `https://github.com/minhlongs/algo-trader`
- **Verified `origin/main` HEAD:** `7319b8d04305d14c95cd366a1593d3bdfa9235ec`

---

## 1. Historical vs. Verified Remote State

| Item | Historical Reference | Live Verified State (2026-11-21) | Notes |
|---|---|---|---|
| `origin/main` | `7319b8d04305d14c95cd366a1593d3bdfa9235ec` | `7319b8d04305d14c95cd366a1593d3bdfa9235ec` | Unchanged; PR #277, #280, #281 merged |
| PR `#282` | `b54e349e014a71082f28c2434dc98d0a0e6d94db` (Draft) | `b54e349e014a71082f28c2434dc98d0a0e6d94db` (Draft) | Audited clean; 11/11 mandatory CI green; `READY_FOR_OWNER_REVIEW` |
| PR `#285` | `05a1b5262f89b0d07d4c2cdcb2393110b9477605` (Draft) | `784d6e986b0e3bad1009af0e1bf1e09400d3b4e7` (Draft) | Fast-forward remediation commit appended for 3 verified defects (backfill attestation, canonical scorecard ledger default, bounded upload timeout); CI triggered on `784d6e98` |
| PR `#288` | New (G8.4) | `156642fd` (Draft, `fix/poly-g8-4-security-283`) | Reconciles `package-lock.json` (`better-auth@1.7.7`, `proxy-addr@2.0.8`) for Issue `#283` |
| PR `#289` | New (G8.4) | `a9463d95` (Draft, `fix/poly-g8-4-reliability-286`) | Fixes `StrategyRunner` tick re-entrancy + offline lifecycle test isolation for Issue `#286`; preserves GhostGuard `<100 ms` threshold |
| PR `#290` | New (G8.4) | `7e7faca0` (Draft, `chore/poly-g8-4-lint-284`) | Removes 55 unused imports across 42 files (`143 -> 88 <= 100`) for Issue `#284` |
| G8.4 Docs PR | New (G8.4) | `docs/poly-g8-4-ic-release-package` (Draft) | 13 IC release reports + `ic-roadmap-manifest.json` |

---

## 2. Open GitHub Issues Tracked

| Issue | Title / Scope | Status | Governance Link |
|---|---|---|---|
| `#287` | POLY-G8.4 Autonomous Release Hardening & IC Roadmap | Open (`in progress` → `in review` → `done`) | Parent tracking issue for G8.4 |
| `#283` | Critical npm dependency-advisory reconciliation (`better-auth`, `proxy-addr`) | Open | Remediated in Draft PR `#288`; `USER_001_INVITE` remains `HOLD` pending prod build provenance |
| `#284` | ESLint warning baseline divergence (143 vs 100 local cap) | Open | Remediated in Draft PR `#290` (`143 -> 88`, local cap unchanged) |
| `#286` | Load-sensitive GhostGuard and StrategyRunner failures | Open | Remediated in Draft PR `#289` |
| `#278` | Empirical collection and governance | Open | Blocked by `DATA_LICENSE`, `INFRA_BUDGET`, `VPS_R2_ACTIVATION` |
| `#275` | Independent Paper Beta `USER_001` | Open | Held pending prod build provenance confirmation (`#283`) |
| `#272` | ExchangeV3 live signing verification | Open | Capital-gated (`LIVE_TRADING_ENABLED=false`, G11/G12/G13 `HOLD`) |

---

## 3. Canonical Polymarket CLI Inventory

Verified directly under `scripts/poly-*.ts`:

- `scripts/poly-market-blind-logger.ts` — **Canonical** Market-Blind prospective forecast logger CLI (default ledger `data/polymarket/market-blind-prospective.jsonl`).
- `scripts/poly-g7-scorecard.ts` — Canonical 11-KPI IC Economic Truth scorecard CLI (aligned to `data/polymarket/market-blind-prospective.jsonl` in PR `#285` commit `784d6e98`).
- `scripts/poly-l2-collector.ts` — Continuous L2 WAL collector wrapper CLI (not activated; no continuous external ingestion).
- `scripts/poly-l2-capture-drill.ts` — Bounded public read-only L2 capture/replay verification drill.
- `scripts/poly-governance-audit.ts` — Governance gate audit CLI.
- `scripts/poly-sidecars.ts` — Sidecar lifecycle helper.
- `scripts/poly-approve-pusd.ts` — Disabled/capital-gated allowance helper (never executed).

---

## 4. Recommended Dependency-Based Merge Order (Owner-Executed Only)

No PR is merged automatically. After Founder review and green CI on every final HEAD:

1. **PR `#288`** (`fix/poly-g8-4-security-283`) — Lockfile security reconciliation (`package-lock.json` only; zero code overlap).
2. **PR `#282`** (`docs/poly-g8-2-sanitized`) — Sanitized G8.2 decision dossier (docs-only; zero code overlap).
3. **PR `#285`** (`fix/poly-g8-3-evidence-integrity`) — G8.3 evidence-integrity remediations A–F (includes G8.4 attestation, scorecard default, and timeout fixes).
4. **PR `#289`** (`fix/poly-g8-4-reliability-286`) — `StrategyRunner` re-entrancy and offline test isolation (zero file overlap with `#285`).
5. **PR `#290`** (`chore/poly-g8-4-lint-284`) — 55 unused-import removals across 42 files (verified zero file overlap with `#285` and `#289`).
6. **G8.4 Docs Draft PR** (`docs/poly-g8-4-ic-release-package`) — `docs/poly-g8-4/*` (13 reports + `ic-roadmap-manifest.json`; zero overlap with code PRs).

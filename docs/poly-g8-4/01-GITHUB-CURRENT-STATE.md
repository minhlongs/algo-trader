# POLY-G8.4 — GitHub Current State & Source-Truth Snapshot

- **Document ID:** `POLY-G8.4-01`
- **Date:** 2026-11-21 (Asia/Saigon)
- **Repository:** `https://github.com/minhlongs/algo-trader`
- **Pre-Release Baseline `origin/main` HEAD:** `7319b8d04305d14c95cd366a1593d3bdfa9235ec`
- **Integrated Pre-Docs `origin/main` HEAD:** `45f2629871b613b326d839fe138a635133865d29`

---

## 1. Historical vs. Verified Integrated State (G8.5 Sequential Merge Train)

| Order | PR | Branch | Pre-Merge HEAD | Squash Merge `main` SHA | Post-Merge `main` CI | Post-Merge CI Run URLs |
|---|---|---|---|---|---|---|
| 0 | Base | `main` | `7319b8d04305` | `7319b8d04305` | PASS | Baseline after PR #277, #280, #281 |
| 1 | `#288` | `fix/poly-g8-4-security-283` | `156642fd95cb` | `951ddb0b6258ca177c7ac4d83bc38c382300a19e` | 3/3 PASS (0 deploys) | `CI` `44901055513`, `CI/CD` `44901055416`, `Sec` `44901055417` |
| 2 | `#282` | `docs/poly-g8-2-sanitized` | `b54e349e014a` | `46aac02451873bcd44dcdcb8189079841e925f3e` | 2/2 PASS (0 deploys) | `CI` `44902000422`, `Sec` `44902000423` |
| 3 | `#285` | `fix/poly-g8-3-evidence-integrity` | `784d6e986b0e` | `e52190b4ee3a15fb09f4acec6b198787e434e5fb` | 3/3 PASS (0 deploys) | `CI` `44903075351`, `CI/CD` `44903075257`, `Sec` `44903075299` |
| 4 | `#289` | `fix/poly-g8-4-reliability-286` | `a9463d9560ae` | `8586b37486658aed4b2fbc70e6470621ac5f15b4` | 3/3 PASS (0 deploys) | `CI` `44904452946`, `CI/CD` `44904452935`, `Sec` `44904453018` |
| 5 | `#290` | `chore/poly-g8-4-lint-284` | `7e7faca0aaad` | `45f2629871b613b326d839fe138a635133865d29` | 3/3 PASS (0 deploys) | `CI` `44905419913`, `CI/CD` `44905419917`, `Sec` `44905419957` |
| 6 | `#291` | `docs/poly-g8-4-ic-release-package` | *(this PR)* | *(pending final merge)* | *(pending)* | Reconciled to `45f2629871b6` prior to merge |

All GitHub Actions run IDs resolve under `https://github.com/minhlongs/algo-trader/actions/runs/<id>`. Every `CI/CD` run executed `Test Suite` only; `Docker Build`, `Deploy CF Worker`, and `Health Check` were `skipped` (`PAGES_AUTO_DEPLOY=false`, `WORKER_AUTO_DEPLOY=false`).

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

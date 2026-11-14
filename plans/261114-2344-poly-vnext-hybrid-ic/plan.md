---
title: "Poly Bot vNext Hybrid IC Architecture (Rust poly-book + GhostGuard sidecars + algo-trader TypeScript core)"
description: "Integrate MIT-licensed Rust sidecars (weiminglong/poly-book & OrderBookTrade/GhostGuard) with algo-trader's TypeScript core, remediate 3 open Polymarket defects (#268, NegRisk thin-leg legPlacement, kpi-poly preflight), and deliver Strategy 3+7 5-state Regime + CLOB V2 Pilot-Ready surface, Strategy 2 eth_call + Poly1271/Relayer dry-run, Strategy 4+6 Dual-Stream + Arbiter News & Market-Blind Bayesian Shrunk Fair-Value, Strategy 8 Lockup-Adjusted Kelly, Governance Tooling, and kpi:poly --stress."
status: completed
priority: P0
issue: 269
closes_issues: [268, 269]
branch: feat/poly-vnext-hybrid-ic
created: 2026-11-15
---

# Plan: Poly Bot vNext Hybrid IC Architecture (Issue #269)

## Locked Gate-1 Contract

| Field | Locked Value |
|---|---|
| Objective | Integrate 2 MIT Rust sidecars (`weiminglong/poly-book` and `OrderBookTrade/GhostGuard`) with `algo-trader` TypeScript core per IC Resolution: remediate 3 defects (incl. `#268`), complete Strategy 3+7, Strategy 2 Pilot-Ready surface, Strategy 4+6 Market-Blind FV & Arbiter News, Strategy 8 Lockup-Adjusted Kelly, CI/EOD/Watchlist governance, and `kpi:poly --stress` in Paper/Shadow mode. |
| Safety Boundary | `LIVE_TRADING_ENABLED=false`, `G1-Soak` (`startedAt=1793536843401`) and `G2-Poly-Shadow` (`startedAtMs=1794047000444`) untouched, zero real orders, zero real wallet keys, zero Worker bundle pollution. |
| Quality Gates | Every touched/new `src/**/*.ts` `<= 200 LOC`, `0 :any`, `0 console.log`, `tsc --noEmit` 0 errors, Vitest green, `check-quality-baseline.mjs --quality` 5/5 PASS, isolated `code-reviewer >= 9.0/10`, PR-only merge. |

## Phases & Disjoint File Ownership

| Phase | Name | Depends On | Owned Files |
|---|---|---|---|
| P1 | Open Defect Remediations (`legPlacement`, `#268`, preflight) | — | `src/desk/polymarket/outcome-token-resolver.ts` (new), 43 legacy `src/desk/strategies/polymarket/*.ts` files with `noTokenId ??` fallback, `src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-leg-executor.ts`, `src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-event-pricer.ts`, `src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage-types.ts`, `tests/polymarket/poly-vnext-defect-remediations.test.ts` (new) |
| P2 | Rust Sidecars (`poly-book` + `GhostGuard`) & Bridges | — | `.gitignore`, `sidecars/poly-book/**`, `sidecars/ghost-guard/**`, `scripts/poly-sidecars.ts` (new), `src/desk/polymarket/l2/l2-source-labels.ts`, `src/desk/polymarket/l2/l2-event-types.ts`, `src/desk/polymarket/l2/poly-book-wal-bridge.ts` (new), `src/desk/polymarket/l2/poly-book-wal-codec.ts` (new), `src/desk/polymarket/ghost-guard-webhook-bridge.ts` (new), `src/desk/polymarket/ghost-guard-types.ts` (new), `tests/polymarket/l2/poly-book-wal-bridge.test.ts` (new), `tests/polymarket/ghost-guard-webhook-bridge.test.ts` (new) |
| P3 | Strategy 3+7 (5-State Regime + CLOB V2 Runtime) & Strategy 2 Pilot-Ready Surface | P1 | `src/desk/polymarket/liquidity-regime-machine.ts` (new), `src/desk/polymarket/liquidity-regime-types.ts` (new), `src/desk/polymarket/five-minute-crypto-guard.ts` (new), `src/desk/polymarket/clob-v2-heartbeat-service.ts` (new), `src/desk/polymarket/clob-v2-order-scoring-client.ts` (new), `src/desk/polymarket/ctf-eth-call-preflight.ts` (new), `src/desk/polymarket/poly1271-session-signer.ts` (new), `src/desk/polymarket/pusd-bounded-approval-runner.ts` (new), `scripts/poly-approve-pusd.ts` (new), `src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker.ts`, `src/desk/strategies/polymarket/quant-alpha/toxicity-aware-market-maker-types.ts`, `src/desk/strategies/polymarket/quant-alpha/negrisk-bundle-arbitrage.ts`, `tests/polymarket/poly-vnext-regime-and-pilot-surface.test.ts` (new) |
| P4 | Strategy 4+6: Market-Blind Bayesian Shrunk FV & Dual-Stream + Arbiter News | — | `src/desk/polymarket/market-blind/market-blind-types.ts` (new), `src/desk/polymarket/market-blind/market-blind-sanitizer.ts` (new), `src/desk/polymarket/market-blind/market-blind-calibrator.ts` (new), `src/desk/polymarket/market-blind/market-blind-shrunk-posterior.ts` (new), `src/desk/polymarket/market-blind/market-blind-prospective-ledger.ts` (new), `src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency.ts`, `src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-detector.ts`, `src/desk/strategies/polymarket/quant-alpha/primary-source-news-latency-types.ts`, `tests/polymarket/market-blind-and-arbiter.test.ts` (new) |
| P5 | Strategy 8: Lockup-Adjusted Multi-Market Kelly & Risk Gate Integration | — | `src/desk/portfolio/poly-lockup-kelly-types.ts` (new), `src/desk/portfolio/poly-lockup-kelly-solver.ts` (new), `src/desk/portfolio/poly-lockup-kelly-allocator.ts` (new), `src/desk/risk/poly-risk-types.ts`, `src/desk/risk/poly-fail-closed-risk-engine.ts`, `tests/portfolio/poly-lockup-kelly.test.ts` (new) |
| P6 | Governance Tooling (Agents #5, #6, #8), Stress `kpi:poly`, Live L2 & GhostGuard Drill | P1–P5 | `src/desk/governance/poly-ci-backtest-auditor.ts` (new), `src/desk/governance/poly-eod-execution-diagnostics.ts` (new), `src/desk/governance/poly-repo-watchlist-monitor.ts` (new), `src/desk/cli/kpi-poly-observed-replay.ts`, `src/desk/cli/kpi-poly-collector.ts`, `src/desk/cli/kpi-poly-book-metrics.ts`, `src/desk/cli/kpi-poly-formatter.ts`, `src/desk/cli/kpi-poly-types.ts`, `scripts/kpi-poly.ts`, `scripts/poly-governance-audit.ts` (new), `package.json`, `tests/governance/poly-governance-and-stress-kpi.test.ts` (new) |

## Checklist

- [x] Quarantine & audit `weiminglong/poly-book` (MIT, `unsafe_code = "forbid"`) and `OrderBookTrade/GhostGuard` (MIT)
- [x] Create tracking GitHub Issue #269 (`in progress`)
- [x] Wave 1 Parallel Execution: P1 (Defects & `#268`), P2 (Rust Sidecars & Bridges), P4 (Market-Blind & Arbiter), P5 (Lockup Kelly & Risk Engine)
- [x] Wave 2 Execution: P3 (5-State Regime + Pilot-Ready Surface wired into Strategy 3 & Strategy 2)
- [x] Wave 3 Execution: P6 (Governance Tooling + `kpi:poly --stress` + full wiring)
- [x] Live Verification Drills: `cargo build --release` both sidecars, live Polymarket WS -> `poly-book` WAL/Parquet -> `algo-trader` replay, live `GhostGuard` `status=0` (`test_known_ghost_fill`) -> `PolyKillSwitch` latch `<1s`, `npm run kpi:poly -- --stress`
- [ ] Isolated `code-reviewer` (`>= 9.0/10`), remediate any findings, open & squash-merge PR, transition Issue #269 `in review` -> `done` -> `shipped`, close `#268`, verify zero orphan processes/worktrees

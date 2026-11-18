# Plan: #POLY-G5 Cloudflare Public Beta (Release A) & Disabled $100 Live-Pilot Prep (Release B)

- **Status:** In Progress (`#273`)
- **Branch:** `feat/poly-g5-public-beta` (worktree `/Users/macbook/algo-trader-poly-g5`, base `b778f53a`)
- **Non-Negotiable Locks:** `LIVE_TRADING_ENABLED=false`, `QWEN_LIVE_ELIGIBLE` unset, G1-Soak & G2-Poly-Shadow preserved, zero changes to `cashclaw.cc` / `quant.cashclaw.cc` / `api.cashclaw.cc/*` / `algo-trader` Worker / production D1.

## Phases & File Ownership

| Phase | Scope | Owned Paths | Verification |
|---|---|---|---|
| **P0** | Forensics, IC Deviation Audit & Security Boundary Matrix | `docs/poly-g5-forensics-and-boundary-matrix.md` | Verified against `b778f53a`, `wrangler.toml`, `clob-client-v2` |
| **P4-A** | Blocker #271 — Worker Build & Node 26 Disk Monitor | `scripts/disk-monitor.ts`, `package.json`, `tests/scripts/disk-monitor.test.ts` | `npm run disk:check && npm run build:worker` |
| **P4-B** | Blocker #272 — ExchangeV2/V3 EIP-712 Signing Alignment, Transport Separation & Golden Vectors | `src/desk/polymarket/clob-v2-venue-constants.ts`, `src/desk/polymarket/clob-v2-order-signing.ts`, `src/desk/polymarket/clob-v2-order-transport.ts`, `src/desk/polymarket/poly1271-session-signer.ts`, `tests/polymarket/clob-v2-order-signing*.test.ts` | `npx vitest run tests/polymarket/` |
| **P4-C** | Blocker C — Settlement, GhostGuard, Heartbeat, Risk Preflight & Partial/Duplicate/Delayed Drills | `src/desk/polymarket/poly-settlement-reconciliation-drills.ts`, `tests/polymarket/poly-settlement-reconciliation-drills.test.ts` | `npm run poly:sidecars -- drill-ghost` + vitest |
| **P1 & P3** | Isolated Cloudflare Beta Worker, D1 Authoritative Ledger, `TenantPaperEngine` DO & Multi-Tenant Security | `wrangler.poly-beta.toml`, `tsconfig.poly-beta.json`, `migrations/poly-beta-d1/0001-poly-beta-ledger.sql`, `src/platform/poly-beta/*.ts`, `tests/poly-beta/*.test.ts` | Adversarial User A vs User B vitest + coverage ≥95% |
| **P2** | First-User React/Vite Beta Journey (`VITE_APP_MODE=poly-beta`) & Playwright Desktop/Mobile E2E | `dashboard/src/poly-beta/*.tsx`, `dashboard/src/App.tsx`, `tests/e2e/poly-beta-first-user.spec.ts` | `cd dashboard && npm run build` + Playwright E2E |
| **P5 & P6** | Disabled $100 Live-Pilot Non-Custodial Design, Legal G12=HOLD, Economic Validation G11 (`kpi:poly` + `--stress`), ADR/Cost/Failure/Threat Docs | `docs/poly-g5-architecture-adr-and-cost-model.md`, `docs/poly-g5-security-threat-model.md`, `docs/poly-g5-live-pilot-readiness-and-gates.md` | `npm run kpi:poly -- --json` & `--stress` |
| **P7 & P8** | Isolated CF Deployment (`poly-beta-api` + `poly-beta-dashboard`), Live Smoke & E2E Screenshots, G9 Prod Integrity Check, Isolated `code-reviewer`, PR Creation | Cloudflare isolated resources + PR on `minhlongs/algo-trader` | All G0–G10 PASS, G11–G13 honest verdicts, ratchet green |

## Acceptance Criteria
1. All quality gates pass (`tsc --noEmit`, `eslint --max-warnings 0` on changed `src/`, `check-quality-baseline.mjs --quality`, `vitest run`, `ci-gate-secret-scan.mjs`, `ci-gate-paper-gate-lock.sh`, `build:worker`, `dashboard:build`).
2. Every new `src/**/*.ts` file is ≤200 LOC, 0 `:any`, 0 `console.*`; the POLY-G5 test suite meets ≥95% aggregate line/function/statement and ≥85% aggregate branch coverage, and the repo's `quality-baseline.json` ratchet passes cleanly. Per-file coverage gaps are tracked as follow-up unless they fail the repository ratchet.
3. Isolated `poly-beta-api` Worker and `poly-beta-dashboard` Pages project pass live first-user smoke + Playwright E2E, while `cashclaw.cc` / `api.cashclaw.cc/*` remain untouched.

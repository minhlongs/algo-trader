# Plan: 25-Step Open-Core Public GitHub + SaaS Monetization Restructuring (`--deep`) — `algo-trader`

- **Status:** IN PROGRESS → COMPLETED
- **Updated:** 2026-10-17
- **Project:** `/Users/macbook/algo-trader` (`@mekong/algo-trader` / `cashclaw`)

## 1. Opening Brainstorm Contract (`--deep` Socratic Synthesis)
- **Intended Product Outcome:** Execute the exact 25-Step Open-Core Public GitHub + SaaS Monetization Restructuring natively inside `~/algo-trader` so the MIT-licensed quantitative desk, 52+ trading strategies, CCXT/Polymarket BYOK adapters, and `cashclaw` CLI drive viral developer adoption on public GitHub while enforcing recurring Cloud SaaS / RaaS monetization (`BASIC`, `PREMIUM`, `ENTERPRISE`, `MASTER` tiers, HMAC-SHA256 license gate, HTTP 402 quota metering, multi-tenant isolation, and NOWPayments/PayOS IPN activation).
- **Constraints:**
  - Zero secret leakage in git history or working tree (`.env*`, private keys, tenant credentials blocked).
  - Strict `< 180 LOC` per code file (well below the 200 LOC ceiling); zero `:any` types in TypeScript; 100% test pass rate.
  - Strictly adhere to Sophia Handover Rules: Protected Flows intact (Setup Wizard, Telegram Bot, NOWPayments & PayOS IPN — **no Polar**); bilingual Vietnamese + English documentation and CLI summaries.
  - Backward compatibility preserved for existing `OpenCoreSaas2026Monetization` exports (`types.ts`, `calculator.ts`, `coordinator.ts`).
- **Non-Goals:** Exposing private tenant strategies or removing license/quota enforcement on hosted RaaS endpoints.
- **Observable Acceptance Criteria:**
  1. `src/desk/opencoresaas2026monetization/catalog.ts`: Exact 25-step catalog across 5 architectural phases mapped to `algo-trader` modules and `BASIC | PREMIUM | ENTERPRISE | MASTER` tiers.
  2. `src/desk/opencoresaas2026monetization/readiness-auditor.ts`: Deterministic 25-step readiness & leak-gate auditor (`OpenCoreReadinessAuditor`).
  3. `src/desk/opencoresaas2026monetization/license-gate.ts`: HMAC-SHA256 cryptographic license token signer/verifier and feature entitlement guard (`HTTP 402 Payment Required` on tier mismatch or expiry).
  4. `src/desk/opencoresaas2026monetization/billing-meter.ts`: Real-time tenant API & strategy quota meter integrated with `TIER_ENTITLEMENTS` and HTTP 402 upgrade URL generation.
  5. `src/desk/commands/opencore-saas.ts` & `src/commands/cli-builder.ts`: CLI command `algo-trader idea:25` (alias `opencore-saas`) supporting `--steps`, `--audit`, and `--funnel`.
  6. `docs/open-core-25-step-saas-restructuring.md`: Complete bilingual (Vietnamese + English) 25-step blueprint for `algo-trader`.
  7. `tests/unit/desk/wave_316_opencore_saas_suite.test.ts`: Comprehensive unit test suite verifying all 25 steps, readiness states, HMAC license gate, HTTP 402 quota meter, CLI runner, and PLG ARR calculator.

## 2. The 25 Exact Steps Mapped to `algo-trader`
- **Phase I (Steps 1–5): Codebase Split & Secret Hygiene**
  1. `git-history-secret-purge` — Scan & purge leaked keys from git history (`gitleaks` / `git-filter-repo`).
  2. `oss-vs-ee-directory-split` — Separate MIT core (`src/desk/`, `src/engine/`, `src/commands/`) from hosted RaaS control plane (`src/raas/`, `src/billing/`).
  3. `gitignore-quarantine-lock` — Lock `.gitignore` against `.env*`, `*.pem`, wallet seeds, and tenant state.
  4. `env-example-byok-template` — Zero-secret `.env.example` template for BYOK exchange & Polymarket keys.
  5. `mit-license-and-sbom` — MIT `LICENSE` header enforcement & dependency SBOM verification.
- **Phase II (Steps 6–10): Plugin Architecture & Extension Seams**
  6. `strategy-plugin-interfaces` — Open `IStrategy` & `MarketDataSource` interfaces in OSS core.
  7. `byok-exchange-adapters` — Local BYOK CCXT (Binance, OKX, Bybit) & Polymarket CLOB connectors.
  8. `cloud-signal-bridge` — Lightweight webhook/WebSocket signal bridge from local CLI to hosted RaaS.
  9. `local-paper-trading-sandbox` — Deterministic local paper-trading & backtesting engine (`cashclaw`).
  10. `versioned-openapi-sdk` — Public OpenAPI v3 spec (`docs/api/openapi.yaml`) & typed client contracts.
- **Phase III (Steps 11–15): Cloud Control Plane & License Gate**
  11. `hmac-jwt-license-gate` — Cryptographic HMAC-SHA256 license token verification (`LicenseGate`).
  12. `mcu-and-quota-metering` — Real-time API & strategy quota metering with `HTTP 402 Payment Required` (`BillingMeter`).
  13. `four-tier-entitlements` — Strict `BASIC | PREMIUM | ENTERPRISE | MASTER` rate & strategy limits (`TIER_ENTITLEMENTS`).
  14. `durable-object-sharding` — Cloudflare Durable Objects (`StrategyShard`) & Redis Cluster execution queues.
  15. `encrypted-api-key-vault` — AES-256-GCM encrypted tenant exchange key storage (`src/seed/security/`).
- **Phase IV (Steps 16–20): Enterprise & Monetization Triggers**
  16. `multi-tenant-rbac-isolation` — Tenant isolation (`subscriber-tenant-isolator.ts`) & role guards.
  17. `immutable-compliance-audit-log` — KYC screening & append-only compliance/AI decision audit trail.
  18. `autonomous-24x7-desk-daemon` — Hosted 24/7 `desk:auto` execution daemon with Telegram `@Sophia_Bbot` alerts.
  19. `strategy-marketplace-revshare` — Verified alpha strategy marketplace subscriptions & creator revenue split.
  20. `nowpayments-payos-ipn-webhook` — Automated tier activation via NOWPayments (Crypto USDT) & PayOS IPN webhooks.
- **Phase V (Steps 21–25): Growth Loop, OSS Community & CI Gates**
  21. `sixty-second-quickstart-cli` — Zero-config `algo-trader quickstart` & `setup` wizard under 60 seconds.
  22. `cli-http402-upgrade-prompt` — In-CLI upgrade prompt with direct checkout URL when hitting `BASIC` quota limits.
  23. `ci-loc-and-secret-gate` — Automated CI enforcement: `< 200 LOC` per file, `0 :any` types, secret scan.
  24. `public-backtest-leaderboard` — Reproducible walk-forward & Monte Carlo benchmark badges for trust.
  25. `cla-and-dual-license-governance` — Contributor License Agreement & trademark protection for `@mekong/algo-trader`.

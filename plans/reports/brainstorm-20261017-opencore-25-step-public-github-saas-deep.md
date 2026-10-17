# Deep Brainstorm Report: 25-Step Open-Core Public GitHub + Cloud SaaS Restructuring (`--deep`)

- **Date:** 2026-10-17
- **Repository:** `/Users/macbook/algo-trader` (`@mekong/algo-trader` / `cashclaw`)
- **Blueprint Tree HMAC-SHA256:** `75a9558c791cf7590a7d6c8732fb4f98702c2d1893db0ebb8fc92e7828882851`
- **Readiness Verdict:** `READY FOR PUBLIC GITHUB` (25/25 steps verified on disk, 0 secret leaks, `OPENCORE_SAAS_FLY_WHEEL_OPTIMAL`)

---

## 1. Bounded Brainstorm Contract (`/ak-brainstorm --deep`)

| Field | Specification |
|:---|:---|
| **Outcome** | Publicly releasable MIT Open-Core repository (`src/desk/`, `src/engine/`, `src/commands/`) paired with a high-margin Cloud RaaS & Enterprise control plane (`src/raas/`, `src/billing/`, `src/durable-objects/`, `src/seed/security/`) enforced via HMAC-SHA256 `LicenseGate`, `HTTP 402 Payment Required` MCU `BillingMeter`, and NOWPayments + PayOS IPN webhooks. |
| **Constraints** | 1. Strict `< 200 LOC` per code file.<br>2. Zero `:any` types and zero new `eslint-disable` comments.<br>3. Zero secret leaks (`.env*`, `.claude/`, `.mekong/` quarantined via `.gitignore`, `.npmignore`, and `.gitleaks.toml`).<br>4. Protected Flows preserved: Setup Wizard, Telegram Bot `@Sophia_Bbot`, NOWPayments + PayOS IPN (Polar strictly forbidden).<br>5. Bilingual documentation (English + Vietnamese). |
| **Non-goals** | No custodial holding of user funds; no migration to Polar; no exposure of internal AI harness prompts in npm tarballs. |
| **Acceptance Criteria** | 1. All 25 steps in `OPEN_CORE_25_STEPS` verified on disk by `RepositoryBlueprintAuditor` (`25/25 = 100%`).<br>2. Root OSS governance files (`LICENSE`, `CLA.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CONTRIBUTING.md`, `.npmignore`) intact.<br>3. `/api/v1/open-core/status` and `/api/v1/open-core/verify-license` mounted and verified.<br>4. `npm run typecheck` (0 errors) and Wave 316 test suites (`15/15` tests) passing. |

---

## 2. Option Exploration & Architectural Decision

| Approach | Summary | Trade-off | Verdict |
|:---|:---|:---|:---|
| **A. Monorepo Dual-Directory Split (`src/desk` MIT vs `src/raas` + `src/billing` RaaS) + Cryptographic Tree Gate** | Single repo with explicit CE/EE module boundary, `.npmignore` tarball quarantine, HMAC-SHA256 `LicenseGate` (`HTTP 402`), and live `RepositoryBlueprintAuditor`. | Requires automated CI & pre-commit checks (`RepositoryBlueprintAuditor` + `.gitleaks.toml`) to prevent accidental secret or EE leakage. | **RECOMMENDED & IMPLEMENTED** (KISS, DRY, zero drift between CE & EE types). |
| **B. Dual Git Repositories (Public Mirror + Private SaaS Repo)** | Separate git histories synced via subtree/submodule scripts. | High sync friction, frequent merge conflicts, broken cross-boundary TypeScript builds. | Rejected (violates KISS). |
| **C. Purely Obfuscated Binary CLI + Closed Backend** | Publish compiled JS bundles only. | Kills GitHub developer trust, stars, and community strategy PRs. | Rejected (defeats Open-Core PLG flywheel). |

---

## 3. The 25-Step Open-Core + Cloud SaaS Blueprint (5 Phases)

### Phase 1: Repository Sanitization & Open-Core Split (`PHASE_1_SPLIT_AND_HYGIENE`)
1. **Step 01 (`step-01-git-filter-repo`):** History sanitization & `.gitleaks.toml` secret scanner rules.
2. **Step 02 (`step-02-open-core-directory-split`):** Physical boundary between MIT CE (`src/desk`) and Proprietary RaaS (`src/raas`).
3. **Step 03 (`step-03-gitignore-npmignore`):** Quarantine `.env*`, `.claude/`, `.mekong/`, `plans/`, and `*.pem` in `.gitignore` & `.npmignore`.
4. **Step 04 (`step-04-env-example-byok`):** Zero-Knowledge BYOK template in `.env.example`.
5. **Step 05 (`step-05-mit-license-headers`):** Root `LICENSE`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `CONTRIBUTING.md`.

### Phase 2: Community Edition (CE) Public Engine (`PHASE_2_PLUGIN_AND_SEAMS`)
6. **Step 06 (`step-06-strategy-loader-plugin`):** Dynamic `IStrategy` plugin loader (`src/desk/strategies/loader.ts`).
7. **Step 07 (`step-07-ccxt-polymarket-byok`):** Local BYOK market-data adapters (`src/desk/market-data/index.ts`).
8. **Step 08 (`step-08-execution-provider-interface`):** Pluggable `OrderDispatcher` seam (`src/desk/execution/order-dispatcher.ts`) switching between local `PAPER` and Cloud RaaS `LIVE`.
9. **Step 09 (`step-09-paper-trading-backtest-ce`):** Unlimited free local backtesting & paper trading (`src/desk/commands/arb-auto.ts`).
10. **Step 10 (`step-10-openapi-v1-contract`):** Public OpenAPI v3 specification (`docs/api/openapi.yaml`).

### Phase 3: SaaS Cloud Control Plane & Licensing (`PHASE_3_CLOUD_CONTROL_PLANE`)
11. **Step 11 (`step-11-hmac-license-gate`):** Offline/Online HMAC-SHA256 `LicenseGate` (`src/desk/opencoresaas2026monetization/license-gate.ts`) returning `HTTP 402 Payment Required` when tier is insufficient.
12. **Step 12 (`step-12-mcu-billing-meter`):** Real-time MCU consumption metering (`src/desk/opencoresaas2026monetization/billing-meter.ts` & `src/billing/billing-meter.ts`).
13. **Step 13 (`step-13-four-tier-entitlement`):** Canonical 4-tier hierarchy (`BASIC | PREMIUM | ENTERPRISE | MASTER`) in `src/desk/opencoresaas2026monetization/types.ts`.
14. **Step 14 (`step-14-cloudflare-durable-objects`):** Stateful sub-millisecond strategy execution shards (`src/durable-objects/strategy-shard-state.ts`).
15. **Step 15 (`step-15-aes-256-gcm-key-vault`):** Envelope-encrypted exchange credential vault (`src/seed/security/index.ts`).

### Phase 4: Multi-Tenant Execution, Audit & Marketplace (`PHASE_4_ENTERPRISE_MONETIZATION`)
16. **Step 16 (`step-16-d1-postgres-rls-isolation`):** Parameterized tenant row-level isolation (`src/desk/subscriber-tenant-isolator.ts`).
17. **Step 17 (`step-17-immutable-sha256-audit-ledger`):** Tamper-evident SHA-256 hash-chained `ComplianceAuditLogger` (`src/desk/security/audit-logger.ts`).
18. **Step 18 (`step-18-managed-24-7-cloud-daemon`):** 24/7 Cloud auto-execution & `@Sophia_Bbot` Telegram alerts (`src/desk/commands/desk-auto.ts`).
19. **Step 19 (`step-19-strategy-marketplace-revshare`):** Creator economy 70/30 revenue split (`src/desk/strategies/marketplace.ts`).
20. **Step 20 (`step-20-nowpayments-payos-ipn`):** Crypto (`NOWPayments`) + VietQR (`PayOS`) IPN webhook activation with explicit Polar rejection (`src/billing/ipn-webhook.ts`).

### Phase 5: PLG Funnel, CI Gates & Dual-License Governance (`PHASE_5_PLG_GROWTH_AND_GOVERNANCE`)
21. **Step 21 (`step-21-npx-quickstart-onboarding`):** 60-second `npx @mekong/algo-trader quickstart` onboarding (`src/desk/cli-builder.ts`).
22. **Step 22 (`step-22-cli-cloud-upgrade-prompt`):** Interactive CLI blueprint & `HTTP 402` upgrade flow (`src/desk/commands/opencore-saas.ts`).
23. **Step 23 (`step-23-ci-loc-and-secret-gate`):** GitHub Actions `< 200 LOC`, `0 :any`, and Gitleaks CI gate (`.github/workflows/ci.yml`).
24. **Step 24 (`step-24-public-backtest-leaderboard`):** Verifiable Sharpe/Sortino/Calmar benchmark leaderboard (`docs/backtest-leaderboard.md`).
25. **Step 25 (`step-25-cla-dual-license-governance`):** Contributor License Agreement (`CLA.md`) preserving dual-license RaaS rights.

---

## 4. Verification Evidence

- **Unit Tests:** `15/15` passing across `tests/unit/desk/wave_316_opencore_saas_suite.test.ts` and `tests/unit/desk/wave_316_company_blueprint_sync.test.ts`.
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`) — `0` errors.
- **Line Count Compliance:** All created/modified files strictly `< 200 LOC` (max `169 LOC`).
- **Unresolved Questions:** None.

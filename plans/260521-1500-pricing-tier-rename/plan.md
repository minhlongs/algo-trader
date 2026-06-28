# Pricing & Tier Rename — Starter / Pro / Growth

**Goal:** Reconcile 14-source pricing drift by adopting marketing canon (Starter $49 / Pro $149 / Growth $399). Full enum rename with backward-compatible license-key parsing.

**Started:** 2026-05-21 15:00
**Charter:** R-10 from `plans/260521-1400-codebase-audit/05-risks-and-gaps.md`

---

## Canonical pricing (target)

| Tier | Price/mo | Key prefix | Max usage (default) | Replaces |
|------|---------:|------------|--------------------:|----------|
| FREE | $0 | `free` | 100 | unchanged |
| **STARTER** | **$49** | **`rss`** | **1,000** | *new* |
| PRO | $149 | `rpp` | 10,000 | unchanged (price was $99) |
| **GROWTH** | **$399** | **`rgw`** | 100,000 | renamed from ENTERPRISE (was $299) |

**Backward compatibility:** legacy `raas-enterprise-*` / `rep-*` license keys parse to GROWTH. `LicenseTier.ENTERPRISE` removed from enum; runtime parser normalises the string `'ENTERPRISE'` → `GROWTH` when reading from JSON store / KV / IPN payloads.

**Feature gates:** `intelligence.swarm`, `execution.multileg` move from `'ENTERPRISE'` → `'GROWTH'` (same privilege level, renamed). All `'PRO'` gates unchanged.

---

## Acceptance criteria

1. `LicenseTier` enum = `FREE | STARTER | PRO | GROWTH` (no `ENTERPRISE`).
2. `nowpayments-service.ts` configures all three paid tiers at canonical prices.
3. Legacy license keys (`raas-enterprise-*` or `RAAS-REP-*`) still validate and resolve to GROWTH tier.
4. Feature-gate hierarchy: FREE=0, STARTER=1, PRO=2, GROWTH=3.
5. All UI surfaces (README, landing, admin, dashboard, Telegram) display Starter / Pro / Growth and canonical prices.
6. All `docs/` files with pricing references reconciled.
7. `npm test` green (existing test suites + 1 new legacy-alias test).
8. `npm run build` passes — 0 TS errors.
9. No silent regression on existing-license read paths (covered by Phase 06 test).

## Out of scope

- NOWPayments dashboard invoice IDs (operator's job; env-var contract documented).
- Existing customers' invoices/communications — handled separately by ops.
- DB migration to rewrite stored `tier` strings — handled lazily by runtime alias.

---

## Phase status

| # | Phase | File | Status |
|---|-------|------|--------|
| 01 | Type system + alias parser | `phase-01-types-and-alias.md` | pending |
| 02 | Billing + feature gate | `phase-02-billing-and-gate.md` | pending |
| 03 | API routes + handlers | `phase-03-routes-and-handlers.md` | pending |
| 04 | UI surfaces (landing/admin/dashboard/telegram) | `phase-04-ui-surfaces.md` | pending |
| 05 | README + docs sync | `phase-05-docs-sync.md` | pending |
| 06 | Tests | `phase-06-tests.md` | pending |

## Touchpoints (from scout)

**Code (~30 files):**
- `src/types/license.ts`
- `src/billing/{license,nowpayments,overage-calculator,revenue-analytics,usage-metering,onboarding}-service.ts`
- `src/middleware/{feature-gate,license-validation}.ts`
- `src/gate/{raas-gate,validators,errors}.ts`, `src/gate/config/tier-config.ts`
- `src/api/routes/{onboarding,signal-subscription,signal-feed,coupon,license,api-key}-routes.ts`
- `src/api/routes/webhooks/handlers/subscription-handler.ts`
- `src/metering/usage-metering-service.ts`
- `src/signal/{signal-publisher,signal-tier-filter,signal-types,telegram-signal-pusher}.ts`
- `src/telegram/{bot-command-handlers,auto-support-handlers}.ts`

**Tests (4):**
- `src/gate/__tests__/raas-gate.test.ts`
- `src/signal/__tests__/{signal-tier-filter,telegram-signal-pusher}.test.ts`
- `src/audit/__tests__/audit-log-service.test.ts`

**UI (4):**
- `src/landing/public/index.html` (already $49/$149 — add Growth $399)
- `src/landing/public/admin.html` (currently Pro $149 / Ent $499 — fix)
- `src/dashboard/public/index.html` (currently Ent $199 — fix)
- `src/telegram/auto-support-handlers.ts:87` (Elite $499 → Growth $399)

**Docs (10):**
- `README.md` (Starter/Pro/Growth row already correct; just verify)
- `docs/system-architecture.md`, `docs/LICENSE_API_GUIDE.md`, `docs/api-rate-limiting.md`
- `docs/project-changelog.md`, `docs/trading-architecture-sops.md`
- `docs/client-self-hosted-trading-company-deployment-architecture.md`
- `docs/cmo-sops.md`, `docs/caio-cso-cco-sops.md`
- `docs/marketing/{twitter-thread,email-sequence,blog-arbitrage-engine,landing-page,discord-announce}.md`

## Risks

- **R-rename-01** — `tier` field stored as string `'ENTERPRISE'` in `data/licenses.json` and KV. Mitigation: normalise on read (`normalizeTier()`); add unit test.
- **R-rename-02** — Existing customer keys with `rep-` prefix. Mitigation: parser accepts both `rep` and `rgw`.
- **R-rename-03** — Webhook payloads may include `'ENTERPRISE'`. Mitigation: same normaliser.
- **R-rename-04** — Hardcoded `'ENTERPRISE'` strings in tests. Mitigation: Phase 06 sweep + update.

## Working principles

- Edit in place — no new "enhanced" files.
- Keep alias logic in one place (`normalizeTier`). DRY.
- Compile after each phase: `npx tsc --noEmit`.
- Run tests after Phase 02, 03, 06: `npm test`.

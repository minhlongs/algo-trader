# Plan — Billing Canonicalization & Public-Surface Safety

**Date:** 2026-10-21
**Source:** `plans/261021-open-core-raas-idea-assessment/idea-assessment.md`
**Mode:** `--parallel` (independent workstreams, no file overlap)
**Blocking question answered by action, not question:** the assessment asked whether algo-trader
is becoming Open-Core. That is a business decision I will not make. This plan does only the work
that is correct **regardless** of that answer.

---

## Brainstorm contract

**Outcome:** one canonical price per tier, no public endpoint advertising a price it does not
charge, and the fake-revenue corpus quarantined from any metric computation.

**Constraints:**
- Public API contract changes are **intentional and must be called out** — `/api/v1/subscriptions/tiers`
  is unauthenticated and already live.
- Billing stays NOWPayments/PayOS only. Polar is banned.
- No new `:any`, no `console.log`, files ≤ 180 LOC.
- **Do not deploy.** CLAUDE.md blockers are unmet (NO-GO verdict, on-call un-notified,
  capacity unmeasured). Code + tests + verification only.

**Non-goals:** choosing the Open-Core direction · building Open-Core scaffolding · changing any
actual price · deleting `data/invoices/` (destructive, needs the user's call) · fixing the
upstream `me-deep-wrapper` gate system.

**Acceptance criteria:**
1. **A subscription row is never `active` without a payment.** `handleUpgradeTier` must create a
   pending/checkout state and require a verified NOWPayments invoice before activating a paid tier.
   This is the highest-priority criterion and blocks the others in importance.
2. A single exported source of truth for tier prices; the tier-list handler derives from it
   instead of hardcoding literals.
3. MASTER no longer reads "Custom" alongside a hardcoded $999 — either the label states the price
   or the tier stops being self-serve.
4. Every tier key the API accepts resolves to a price from that source (no silent gaps).
5. Test proves the served `/tiers` payload matches the pricing source.
6. Test proves the Master/custom mismatch cannot regress.
7. Every tier the public API and Telegram advertise resolves to a price in a canonical source —
   no unmappable tier keys (`BASIC`, `PREMIUM`) reachable by a customer.
8. `tsc --noEmit` 0 errors, worker build 0 errors, full suite green, shellcheck clean.
9. Revenue-corpus guard prevents fixture invoices from feeding a revenue metric.
10. **Tests are fail-open**: removing the payment-requirement re-breaks the suite.

---

## Workstreams (parallel, disjoint file ownership)

| ID | Title | Files owned |
|---|---|---|
| **A** | Unify tier pricing on `PRICING_TIERS` as source of truth | `src/platform/workers/api/subscriptions-types.ts`, `src/platform/workers/api/subscriptions-handlers.ts`, `src/platform/workers/api/subscriptions.ts`, `src/platform/billing/pricing-tiers.ts` |
| **B** | Fix the "Master (Custom)" auto-charge defect | `src/platform/workers/api/subscriptions-handlers.ts` — **conflict, see below** |
| **C** | Revenue-corpus guard (fixtures must not reach metrics) | `src/platform/billing/revenue-source-of-truth.ts` (new), `src/platform/billing/__tests__/` |
| **D** | Cross-source price consistency test (platform + signals) | new test files only |
| **E** | Telegram tier list: real keys + real prices | `src/platform/telegram/handlers/wave5-routes.ts` + its test |

**File-conflict resolution:** A and B both touch `subscriptions-handlers.ts`. Run **B first** as the
smaller behavioural fix, then A on top. B and A are therefore sequenced; C, D, E run in parallel
against disjoint files.

---

## Scout summary (evidence, restated for reviewers)

**The repo has TWO product lines, not "N contradictory tables": platform and signals.** The
assessment's draft said three; the true count of price-bearing sources is **five**, and four of
them are consistent once you separate the product lines. Only one is a real defect family.

| Source | Line | Tiers / prices |
|---|---|---|
| `src/platform/billing/pricing-tiers.ts` (`PRICING_TIERS`) | platform | Free $0 · Pro $99 · Enterprise $299 · Master $999. **Canonical** (marked "ME IDEA Business Viability — C1 criterion"). No STARTER. |
| `src/billing/pricing-tiers.ts` | platform | 5-line **re-export** declaring the above canonical — DRY done, not drift |
| `src/platform/workers/api/subscriptions-types.ts:33` | platform | `PRICING` in cents; adds **STARTER 4900**; otherwise agrees |
| `src/platform/billing/nowpayments-types.ts` (`NOWPAYMENTS_TIERS`) | platform + **signals** | Pro $99 · Enterprise $299 · Master $999 **and** Signals Basic $29 · Signals Pro $99 · Signals Enterprise $299 |
| `src/platform/billing/enterprise-inquiry-store.ts:13` | platform | pro $99 · enterprise $299 · master $999 (ACV) |
| `src/platform/api/routes/coupon-routes-helpers.ts:9` | **other projects** | cashclaw/openclaw/sophia/mekong — **no `algo-trader` key**. Shared NOWPayments account. Report only. |
| `src/platform/middleware/feature-gate.ts` | access control | `TIER_HIERARCHY` ordinals — **no prices** |

So the platform line agrees everywhere except STARTER; the signals line is genuinely separate and
self-consistent.

### Two real defects

- **D1 (live, customer-facing):** `subscriptions-handlers.ts:138` serves `label: "Master (Custom)"`
  alongside `amount_cents: 99900`. A user selecting "Custom" is auto-charged $999/mo.
- **D2 (structural):** `handleGetTiers` ignores `getTierPrice()`/`PRICING` and hardcodes its own
  literal, so the served payload is an independent sixth source that can drift.

### D4 — **CRITICAL, found while implementing Phase B.** Self-serve upgrade grants a paid tier with no payment

`handleUpgradeTier` (`subscriptions-handlers.ts:52-95`) is the single most serious defect found in
this whole effort, and it was not in the original assessment.

Flow: POST `/api/v1/subscriptions/upgrade` with `{tier: "PRO"}` →

1. validate tier is in `['STARTER','PRO','ENTERPRISE','MASTER']` ✓
2. `getTierPrice(tier)` — used **only to record the amount**, never to charge
3. INSERT into `subscriptions` with **`status: 'active'`**, `amount_cents: price.amount_cents`, and
   **`nowpayments_invoice_id` bound to `NULL`**
4. write `tier:${userId}` to KV cache → feature gates now read `PRO`
5. return `200 {tier:'PRO', status:'active', amount_cents: 9900}`

**No invoice is created. No NOWPayments call is made. No checkout redirect. No payment of any kind.**
The file imports nothing payment-related (verified: import list is logger, types, helpers only).

Reachability verified live: route is registered at `edge-proxy.ts:89` (`POST /api/v1/subscriptions/upgrade`),
returns **401 when unauthenticated**, and `SUBSCRIBERS` D1 **is bound** in `wrangler.toml` (database
`f29559f2-8e0b-461a-bd01-5665581beeee`) — so this executes for real, not against a fallback.

Impact: **any authenticated user self-upgrades to any paid tier for free.** `GET /api/v1/subscriptions/me`
then reports them `active` at $99/mo. Revenue cannot be measured from this table, because a row in it
is not evidence of payment — which very likely explains why `current_mrr` reads 0 while the gate says
`first-revenue: passed`. This is the same class as D1 (customer-facing) but orders of magnitude worse.

**Phase B now primarily means fixing D4.** It is the only defect here that a customer could exploit
for real value, and it invalidates every revenue number downstream.

### D3 — discovered after the draft, and arguably worse than D1

`src/platform/telegram/handlers/wave5-routes.ts:86` (`formatWave5Subscribe`) offers customers
**BASIC / PREMIUM / MASTER** with **zero prices displayed**. Neither `BASIC` nor `PREMIUM` exists in
`LicenseTier`, `PRICING_TIERS`, `PRICING`, or `TIER_HIERARCHY` — they are unmappable tier keys. A
user who follows that upgrade path cannot have either tier fulfilled, and the signals line they are
most likely being sold ($29/$99/$299) is never named or priced anywhere customer-facing.

`data/invoices/`: 16,356 files, all `status: "paid"`, six fixture emails, sums to $2,221,480.
Gitignored (`.gitignore:7`), untracked. Written by production `payment-handler.ts:8` on IPN success.

---

## Phase A — Tier-list handler derives from canonical pricing

1. Add `STARTER` to `PRICING_TIERS`? **No — decision made:** the live API serves STARTER at $49 and
   removing it is a contract break. Instead the canonical table gains STARTER at $49, matching the
   live contract, so canonical and served agree.
2. Rewrite `handleGetTiers` to build rows from `PRICING_TIERS` + `getTierPrice()`, keeping
   `amount_cents` and bilingual labels for FREE/PRO/ENTERPRISE/MASTER.
3. Add a `selfServe` flag: MASTER becomes non-self-serve (see Phase B).
4. Keep response key set unchanged (`tier`, `label`, `amount_cents`, `currency`, `features`) so no
   consumer breaks on shape.

## Phase B — payment required before a tier is active (D4), plus the label fix (D1)

**B1 — the critical fix.** `handleUpgradeTier` must stop minting paid tiers for free.

The house pattern already exists and this fix copies it exactly: the coupon checkout path
(`src/platform/workers/coupon-redeem.ts:46-56`, `coupon-validate.ts:38`) calls
`createInvoice(env.NOWPAYMENTS_API_KEY, orderId, description, price)` and returns a
`checkoutUrl` to the caller. The tier is activated later, by the IPN webhook. It writes **no
subscription row** at checkout time.

Minimum correct behaviour:
- A paid tier upgrade calls `createInvoice` and returns `{ checkoutUrl, tier, amount_cents }`.
- It writes **no subscription row and no `tier:*` KV entry** at request time — the row and the
  cache are written by the payment/IPN path once money has actually arrived.
- Returns **503 with a clear message** when `NOWPAYMENTS_API_KEY` is absent, rather than silently
  falling back to granting the tier. (Verified: `Env` in `subscriptions-types.ts:7-18` has no
  `NOWPAYMENTS_API_KEY` — it must be added, as the coupon path already uses it.)
- FREE remains valid without payment, and is the only tier activatable with no invoice.
- If a `pending_payment` row is ever wanted, `SubscriptionRow.status` (`subscriptions-types.ts:22`)
  must be widened first — today it is `'active' | 'canceled' | 'expired'`. **This plan does not
  widen it**, because writing no row is strictly safer than inventing a state the IPN path does not
  know how to clear.

**B2 — the label fix.** MASTER's served label states its real price ("Master — $999/mo") instead of
"Custom", so no customer is told a quote is coming and then charged.

**B3 — a test that is fail-open for both.** New test file
`src/platform/workers/__tests__/subscriptions-upgrade-payment-required.test.ts` asserting:
- an upgrade request does **not** produce an `active` subscription row
- no `tier:*` KV entry is written before payment
- the response carries a payment-pending signal, not an activation
- reverting the fix (allowing an active insert) fails at least one assertion

Prefer a small extracted helper (e.g. `isSelfServeTier`, `requiresPayment`) over inlining the logic,
so the test targets one function. Keep `subscriptions-handlers.ts` under 180 LOC — it is currently
~140, so extract rather than grow it.

## Status (2026-10-21)

| Phase | State |
|---|---|
| B (D4 free-upgrade hole + D1 label) | **DONE** — handler returns checkout URL, writes no row, fails closed with no API key. 9/9 tests, fail-open proven both directions |
| C (revenue-corpus guard) | **DONE** — 19/19. Verified: `listInvoices` has **zero production callers**, so the $26.7M hazard is **latent, not live** |
| D (cross-source consistency) | **DONE** — 14/14; caught the STARTER gap, which is now closed in `PRICING_TIERS` |
| E (Telegram unmappable tiers) | **DONE** — 115/115; renders real signals tiers at $29/$99/$299, bilingual layout intact |
| A (single source of truth) | **PARTIAL** — STARTER added to canonical table; `handleGetTiers` still hardcodes its literal — converted to derive from `PRICING`/`PRICING_TIERS` so drift is structurally impossible (Track D's test #6 already guards this and will fail until done) |

## Committed: `eb07d8e2` — not deployed

The live Worker still serves `MASTER / "Master (Custom)"` and still contains the free-upgrade
hole. **Both defects are live in production until deployed.** Verified: `curl
https://api.cashclaw.cc/api/v1/subscriptions/tiers` returns the old label today.

Deploy is a separate step requiring a deploy decision (see `plans/261020-1345-golive-zero-bug/go-no-go.md`):
CLAUDE.md's blockers — on-call notified, 12k capacity measured, NO-GO resolved — are unmet, so the
repo's own contract forbids deploying from this state. The code is ready; the operational gate is not.

## Verification results (commit `a86e7718`)

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `tsc -p tsconfig.worker.json` | 0 errors |
| `vitest run` (full) | **1348 passed / 1 skipped, 17169 tests, 0 failed** |
| Quality ratchet | 5/5 pass |
| `handleUpgrade` fail-open | proven in both directions (gate disabled → 2 tests fail) |
| Credential scan on the full diff | 0 hits |

**One flaky test, named not waved off:** `tests/desk/arbitrage/m2-challenger-stress.test.ts`
("sanitizes NaN notional inputs…") failed on one full-suite run and passed in isolation (22/22)
and on two subsequent full runs. It is unrelated to this change — nothing here touches the
arbitrage desk — and it is a stderr-logging stress test, consistent with a timing/parallelism
flake. Worth a look separately.

## Deliberately not done
- `data/invoices/` (64 MB) not deleted — destructive, needs approval.
- Write path (Track C follow-up #1) not guarded: `payment-handler.ts:33` still writes fixture
  invoices, so residue keeps accumulating.
- Malformed-email policy (Track C follow-up #2) left as-is; it is a deliberate trade-off.
- Coupon table has no `algo-trader` key — reported only; it is shared across four products.

### C's correction to my original framing

I said the corpus "would launder test residue into a growth narrative." Verified after the fact:
**nothing in the repo rolls up `data/invoices/`** — `listInvoices()` is exported with no production
caller. The hazard is preventive, not an active bug report. That weakens my claim and is recorded
here rather than quietly dropped.

Two follow-ups C flagged, both outside its scope and both needing a decision:
1. **The write path is still open.** `payment-handler.ts:33` calls `generateInvoice` on every IPN
   success with no fixture check, so test residue keeps accumulating. Durable fix: don't write
   fixture invoices, not just filter them at read.
2. **Malformed emails fail open** by design (`not-an-email` counts as a customer). Deliberate: a
   denylist risks under-counting real payers. Pinned by a test.

## Phase C — Revenue-corpus guard

1. New `revenue-source-of-truth.ts`: resolves MRR/revenue from the authoritative source
   (`first-revenue.json` / payments) and **explicitly refuses** to sum `data/invoices/`.
2. Export a `isFixtureEmail` guard so fixture addresses (`e2e-customer@test.com`, `a@b.com`,
   `invoice-test@example.com`, `user&test@example.com`, `curr@example.com`,
   `fail@example.com`) can never count as a customer.
3. Test: summing the corpus with the guard yields 0 customers and $0 MRR.

## Phase E — Telegram tier list shows only tiers that exist, at prices that are real

`formatWave5Subscribe` currently advertises `BASIC` and `PREMIUM`, which no license key can
satisfy, and shows no prices at all.

1. Replace with the **signals** product line, which is what the feature list actually describes
   (daily signals, quotas, swarm engine): Signals Basic $29 · Signals Pro $99 · Signals
   Enterprise $299 — sourced from `NOWPAYMENTS_TIERS`, not literals.
2. Drop `BASIC`/`PREMIUM` entirely; keep `MASTER` only if it maps to a real tier.
3. Keep the bilingual format and the `/link <license-key>` call to action.
4. Update the test's expectations from `BASIC`/`PREMIUM` to the real tier keys.

**Deliberately unchanged:** the platform tiers (Starter/Pro/Enterprise/Master). Mixing two product
lines into one customer-facing list is what created the confusion; the fix is one line per surface.

## Phase D — Cross-source price consistency test

New test asserting all four tables agree on every shared tier key, and that any tier the public API
accepts resolves to a price. Fails loudly on future drift instead of silently diverging.

---

## Risk register

| # | Risk | Mitigation |
|---|---|---|
| 1 | Changing served tier payload breaks a consumer | Key set held constant; STARTER stays at $49; only MASTER label/behaviour changes |
| 2 | MASTER loss of self-serve could break a test | Grep for MASTER in subscription tests before editing; Phase D run first |
| 3 | Coupon table has no algo-trader key — "fixing" it could break the shared account | **Out of scope.** Report only; that table is shared across four products |
| 4 | Enterprise ACV agreeing with canonical could be coincidence | Verified identical values; no change needed |

## Verification

```bash
npx tsc --noEmit                                  # 0 errors
npx tsc -p tsconfig.worker.json --noEmit          # 0 errors
npx vitest run                                    # 17127+ pass, 0 fail
shellcheck -e SC1091 scripts/*.sh                 # clean
```

Plus live check post-deploy (deferred, not this plan):
`curl -s https://api.cashclaw.cc/api/v1/subscriptions/tiers | jq`.

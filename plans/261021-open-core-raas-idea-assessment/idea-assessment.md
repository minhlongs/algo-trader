# `/idea --deep` — Open-Core / $1M RaaS Assessment

**Date:** 2026-10-21
**Repo:** `/Users/macbook/algo-trader` (`@mekong/algo-trader` v3.1.96, HEAD `ef02751f`)
**Pipeline:** `/idea --deep` Step 1 (Open-Core Idea & Edition Partitioning)

---

## Verdict: **NO-GO for the idea as framed.** The skill's premise does not hold in this repo.

This is not "the idea is bad." It is that `/idea`'s hard constraints require the skill to map the
idea onto a specific architecture — Sophia's `src/seed/` 4-layer foundation, the open-core
manifest, the RAAS license verifier, edition gating — **and none of it exists here.** Producing the
canvas anyway would have required me to describe an edition boundary the repo does not have,
which is precisely the fabrication the skill forbids.

Separately, running the pipeline uncovered two **live** defects worth fixing regardless of
whether this idea proceeds.

---

## 1. Scout findings — the skill's scaffolding is absent

Checked every artifact the skill names as canonical:

| Skill assumes | Actual |
|---|---|
| `src/seed/config/open-core-manifest.ts` | **MISSING** |
| `src/seed/security/raas-license-verifier.ts` | **MISSING** |
| `src/tree/open-core/workspace-portability-store.ts` | **MISSING** |
| `src/seed/db/get-user-tier.ts` | **MISSING** |
| `src/seed/auth/better-auth-session.ts` | **MISSING** |
| `SOPHIA_EDITION` gating anywhere | **0 occurrences** |
| 4-layer `seed → tree → forest → land` boundary | no such layer split in this repo |

`src/seed/` exists, but it is algo-trader's own DB/seed directory, not Sophia's foundation layer.

**algo-trader is not an Open-Core dual-license product.** It is a
Cloudflare-Worker edge proxy over a trading desk, with a licensing/subscription surface bolted on.
There is no Apache-2.0 community wedge, no `RAAS_LICENSE_KEY`, no portability bundle, no
`CommercialUpgradeModal`, no WorkspacePortability flow. The PLG conversion funnel the canvas is
built around has no second end.

---

## 2. Verified: there is no revenue, and the corpus that looks like revenue is fabricated

The skill requires evidence labels. These are **Verified**:

| Claim | Evidence |
|---|---|
| Live Worker prices | **$49 / $99 / $299 / $999 per month**, read from `https://api.cashclaw.cc/api/v1/subscriptions/tiers` |
| MRR | **$0** — `me-deep-wrapper/state/evidence/first-revenue.json` says `current_mrr: 0` |
| Paying customers | **0** — see below |
| Gate state | `first-revenue` says `passed` with 0 evidence entries; see §5 |

### The 16,356-file invoice corpus

`data/invoices/` holds **16,356 JSON files, 64 MB**. Every one is `status: "paid"`. Summing the
`amount` field naively yields **$2,221,480** — which, annualised, is a **$26.7M ARR claim from zero
customers.**

Every file carries one of **six email addresses**, all test fixtures:

| Count | Email |
|---|---|
| 15,432 | `e2e-customer@test.com` |
| 610 | `a@b.com` |
| 305 | `invoice-test@example.com` |
| 3 | `user&test@example.com` |
| 3 | `curr@example.com` |
| 3 | `fail@example.com` |

**Verified distinct real customers: 0.** Any dashboard, deck, or gate that rolls up this directory
reports a seven-figure business that does not exist. This is the single most dangerous artifact in
the repo for this pipeline: `/idea` is a tool for reasoning *toward* $1M, so a rollup here would
launder test residue into a growth narrative.

Mitigating facts (also verified): the directory is **gitignored** (`.gitignore:7 /data/`), so
`git ls-files data/invoices/` is **0** — no fixture was ever committed. It is E2E test residue from
`payment-handler.ts:8`, which writes an invoice per successful IPN.

---

## 3. Verified: three mutually contradictory price tables

| Source | Tiers | Prices | Consumers |
|---|---|---|---|
| `src/platform/workers/api/subscriptions-types.ts:33` | FREE/STARTER/PRO/ENTERPRISE/MASTER | $0/$49/**$99**/$299/$999 | shared by Worker subscription routes |
| `src/platform/api/routes/coupon-routes-helpers.ts:9` | per-project; **no `algo-trader` key** | sophia $199/$399/$799/$4,999; cashclaw $49/$149/$499; openclaw $49/$149/$399/$799/$4,999; mekong $49/$149 | coupon checkout |
| `src/platform/billing/enterprise-inquiry-store.ts:13` | pro/enterprise/master | **$99/$299/$999** monthly | enterprise contact form |

And a fourth source that overrides all of them: `subscriptions-handlers.ts:138` hardcodes the tier
list literal, **ignoring `getTierPrice()`/`PRICING` entirely.** The skill's "canonical stack and
billing" constraint cannot be satisfied — there is no canonical price.

The coupon table is a **shared NOWPayments account across four products** (`cashclaw`,
`openclaw`, `sophia`, `mekong`) with hardcoded `invoiceId`s. algo-trader has no entry, so
**algo-trader has no coupon-compatible price at all.**

**What the live endpoint says today** (`subscriptions-handlers.ts:132-138`, confirmed against
production):

| Tier | Label served | `amount_cents` | Implied |
|---|---|---|---|
| FREE | Miễn phí / Free | 0 | — |
| STARTER | Starter ($49/mo) | 4900 | consistent |
| PRO | Pro ($99/mo) | 9900 | consistent |
| ENTERPRISE | Enterprise ($299/mo) | 29900 | consistent |
| MASTER | **Master (Custom)** | **99900** | **$999/mo — not "custom"** |

### Live defect #1 — "Master (Custom)" is served with a hardcoded price

`subscriptions-handlers.ts:138` advertises MASTER as **"Master (Custom)"** but hardcodes
`99900` cents. A customer who selects "Custom" is charged **$999/month automatically.** Custom
tiers are meant to be quoted, not auto-charged. This is a customer-facing billing defect on a live
public endpoint, reachable with no auth.

---

## 4. Verified: a gate that cannot report its own failure

From the earlier go-live review (`evidence/track-c-gate-evidence-audit.md`), independently
re-verified:

- `me-deep-wrapper/lib/goal-executor-state.sh:198` — `record_gate_evidence` **unconditionally**
  sets `data["current_gate"] = gate`. No comparison against existing progress.
- `me-deep-wrapper/lib/goal-executor-gates.sh:26-154` — the non-strict path calls
  `record_gate_evidence` for every gate, and it always returns 0.
- `first-revenue` (gates.sh:73-88) records evidence **only** when `current -gt 0`, so with MRR=0 it
  prints `MISS` and records nothing.

Net effect: **a green verify exit code proves only that the verifier ran.** Current state is
`first-revenue: status=passed, evidence=0`, `current_gate: scale-ready`, `first-1m-mrr: active`.

This matters directly to `/idea`: Step 2 of the pipeline is to "synchronize the 25-step Company
Blueprint" and update `.mekong/company.json` and the gate ladder. Doing so against a gate system
that records invocation order rather than progress would write business progress into a ledger
that cannot distinguish executed from unexecuted.

---

## 5. Why the canvas cannot be run as specified

Each Step 1 requirement, and what it needs:

| Requirement | Blocked by |
|---|---|
| Partition idea into Community / Cloud / Enterprise | no edition concept, no manifest, no `SOPHIA_EDITION` (§1) |
| PLG upgrade trigger via portability bundle | portability does not exist (§1) |
| Canonical stack + billing tiers $199/$399/$799/$4,999 | three contradictory price tables; live tier set is $49/$99/$299/$999 (§3) |
| `≤180 LOC`, 0 `:any`, 0 `console.log` | not verified for this idea — no idea selected yet |
| Step 2 blueprint sync to `.mekong/company.json` + gates | gate system cannot report failure; MRR is 0 (§4) |
| Evidence labels (Verified / Hypothesis / Target) | satisfied for the findings here; the idea itself has no evidence either way |

I could produce a plausible-looking canvas. It would be fiction: an edition boundary, a price
ladder, and a PLG funnel invented to fit a template, over a repo with $0 MRR, 0 customers, and
three incompatible price books.

---

## 6. What would make this GO

Blocking, in dependency order — the first two are prerequisites for the rest:

1. **Fix the live billing defects.** `Master (Custom)` must not auto-charge; pick one price
   source and delete the others. Until then any monetization idea is priced by whichever table a
   given code path happens to read.
2. **Decide whether algo-trader is being turned into an Open-Core product at all.** That is a
   scope decision — build the 4-layer foundation, the manifest, and the license verifier (real
   work, roughly a Phase 1 of its own) — or stop invoking an Open-Core pipeline against a repo
   that isn't one. **This is a business decision, not a technical one, so it is yours.**
3. **Purge or quarantine `data/invoices/`** before any revenue metric is computed anywhere. 64 MB
   of test residue that sums to $2.2M is a loaded gun next to a $1M goal.
4. **Fix the gate system** so a green exit means a gate passed, not that the verifier ran.
5. Only then: re-run `/idea` with a specific idea, against a repo whose billing is single-sourced
   and whose gates can fail.

---

## Evidence labels

| Statement | Label |
|---|---|
| Sophia scaffolding missing (7 paths + `SOPHIA_EDITION`) | **Verified** — filesystem + grep |
| Live tiers $49/$99/$299/$999 | **Verified** — `curl` against `api.cashclaw.cc` |
| 16,356 invoices, 6 fixture emails, $0 real customers | **Verified** — parsed all files |
| Three contradictory price tables | **Verified** — read all three sources |
| `Master (Custom)` served at $999 | **Verified** — source line + live payload |
| `current_mrr: 0` | **Verified** — `first-revenue.json` |
| Gate cannot report failure | **Verified** — upstream source, independently re-read |
| `data/invoices/` untracked & gitignored | **Verified** — `git ls-files` = 0, `.gitignore:7` |
| An Open-Core pivot *would* raise revenue | **Hypothesis** — untested, no customer evidence either way |
| $1M RaaS is reachable | **Target** — directional only; zero current evidence |

## Unresolved questions
- Is algo-trader intended to converge on Sophia's architecture, or stay a standalone trading
  product? Everything downstream depends on this and I cannot infer it.
- Who owns the shared NOWPayments account, and should algo-trader get its own coupon table?
- Should `data/invoices/` be deleted (64 MB, gitignored) or is it retained deliberately as E2E
  evidence? Deletion is destructive, so I have not done it.

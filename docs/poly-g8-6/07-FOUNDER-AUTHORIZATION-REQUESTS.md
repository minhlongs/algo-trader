# POLY-G8.6 — Founder Authorization Requests

**Date:** 2026-11-22  
**Governance:** Zero emails sent, zero counsel hired, zero contracts accepted, zero deployments executed, zero PRs merged, zero invitations sent. Each item below requires explicit, separate Founder approval.

---

## Authorization Request 1 — Dispatch Polymarket / ICE Data-Licensing Inquiry (`#278`)
- **Action Requested:** Founder completes truthful personal/business identity fields in [`01-DATA-LICENSE-INQUIRY.md`](./01-DATA-LICENSE-INQUIRY.md) and sends **one** email from a verified account to `data-licensing@polymarket.com` (Cc: `sales-icedataservices-usinsidesales@theice.com`).
- **Financial Commitment:** `$0` (information and pricing inquiry only; does not accept any agreement).
- **Risk if Deferred:** `DATA_LICENSE_PERMISSION` and `IC_DAY_0` remain indefinitely `HOLD`.

## Authorization Request 2 — Request Fixed-Fee Vietnam Legal G12 Quotation
- **Action Requested:** Founder selects 1–2 independent licensed Vietnamese law firms and sends the compact fixed-fee quote request in [`03-VIETNAM-LEGAL-COUNSEL-REQUEST.md`](./03-VIETNAM-LEGAL-COUNSEL-REQUEST.md), supplying private operator/entity facts separately under privilege.
- **Financial Commitment:** `$0` for quote request (any quoted legal fee returns to Founder for separate approval before engagement).
- **Risk if Deferred:** `LEGAL_G12` remains `HOLD` for both IC research and Paper Beta SaaS.

## Authorization Request 3 — Approve Narrow Paper Beta Hardening PR & Clean CI Redeploy (`#275`)
- **Action Requested:** Authorize a separate narrow PR to: (a) inject `COMMIT_SHA` into `poly-beta-api` and `poly-beta-dashboard`, (b) add a fail-closed private signup allowlist to `handleBetaSignup`, and (c) replace CashClaw commercial metadata on `poly-beta-dashboard` with isolated `$100 virtual / $0 real` simulation & privacy disclosures — followed by a separate Founder approval to run a clean CI deploy from `>= 87c8db9a` (`better-auth@1.7.7`, `proxy-addr@2.0.8`).
- **Financial Commitment:** `$0` (existing Cloudflare Workers/Pages free/existing plan).
- **Precondition for `USER_001`:** `USER_001_INVITE` remains `HOLD` until this redeploy is verified live and Founder separately approves inviting `USER_001`.

## Authorization Request 4 — Review & Merge Track E Settlement Verification Boundary Draft PR (`#292`)
- **Action Requested:** Review Draft PR `#292` (`fix/poly-g8-6-settlement-provenance`) implementing offline settlement-claim hardening, read-only Polygon PoS CTF `ConditionResolution` verifier interface, Ed25519-signed verification receipts, public-key verifier registry, and adversarial regression tests (`w_skill = 0` enforced; live RPC verification remains `HOLD`).
- **Financial Commitment:** `$0` (offline code & unit tests only).

## Authorization Request 5 — Defer Infrastructure Budget Expansion Until Track A Pricing Arrives
- **Action Requested:** Confirm **Option A (`HOLD` at `$0/mo`)** until Track A returns written licensing pricing, then evaluate **Option B** (`$50/mo` base / `$75/mo` cap), **Option D** (licensed feed), or **Option E** (suspend strategy).
- **Financial Commitment:** `$0` now.

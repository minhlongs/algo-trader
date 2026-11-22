# POLY-G8.6 Track B — Paper Beta Deployed Provenance & Security Audit

**Date:** 2026-11-22  
**Tracking Issue:** `#275`  
**Audit Mode:** Strictly Read-Only (Cloudflare CLI metadata + non-mutating HTTP `GET` + Git history)  
**Verdicts:**  
- `PAPER_BETA_DEPLOYED_SHA = UNKNOWN`  
- `PAPER_BETA_DEPENDENCY_PROVENANCE = UNKNOWN`  
- `PAPER_BETA_SECURITY = HOLD`  
- `USER_001_INVITE = HOLD`

---

## B1 & B2. Read-Only Deployment Provenance Inspection

Inspected live Cloudflare deployment metadata on `2026-11-22` without printing secrets, modifying bindings, or creating deployments:

| Surface | Active Deployment Identity | Timestamp | Source / Build Pipeline | Commit SHA Provenance | Predates PR `#288` (`2026-11-21T11:51:09Z`)? |
|---|---|---|---|---|---|
| Worker `poly-beta-api` (`wrangler.poly-beta.toml`) | Version `9e73110c-4a8f-4587-869c-59085ee7ec55` (100% traffic, deployment `fb260b34-3f46-4470-8d6a-0c86d98a5f25`) | Created `2026-11-18T05:12:01.624Z`, Deployed `2026-11-18T05:12:03.261Z` | `Unknown (version_upload)`, Tag `-`, Message `-` | **`UNKNOWN`** (`COMMIT_SHA` var absent in `wrangler.poly-beta.toml`; `/api/health` falls back to `'dev'`) | **YES** (deployed 3 days before PR `#288`) |
| Pages `poly-beta-dashboard` (`wrangler.poly-beta-pages.toml`) | Deployment `b65ede0e-ecfd-4e3a-a9a0-65c1612eab60` (`https://poly-beta-dashboard.pages.dev`) | ~3 days before `2026-11-22` (`2026-11-18/19`) | Manual upload (empty `Source`, no Git provider; earlier rows `37f782dd`, `1cdc9293`, `c3b2d396` show `b778f53`) | **`UNKNOWN`** (not cryptographically mapped to a CI build or `87c8db9a`) | **YES** (deployed before PR `#288`) |

- **Worker Routes & Isolation (`wrangler.poly-beta.toml`):** `routes = []` (bound to `poly-beta-api` workers.dev / Pages proxy), separate D1 database `poly-beta-db`, separate KV namespace `POLY_BETA_KV`, separate Durable Object `TenantPaperEngine` (`class_name = "TenantPaperEngine"`). Zero shared bindings with production `algo-trader` (`api.cashclaw.cc`).
- **Live Health Endpoint:** `GET https://poly-beta-dashboard.pages.dev/api/health` returned HTTP `200` (Edge/Pages proxy reachable), which does **not** prove patched source or lockfile provenance.

---

## B3. Dependency Security & Transitive Reachability

Compared the pre-PR `#288` lockfile at `558adee1` (last commit touching `src/platform/poly-beta/`) against current `main` (`87c8db9a`, post-PR `#288`):

| Package | Lockfile at `558adee1` (Pre-`#288`) | Lockfile at `87c8db9a` (Post-`#288`) | Reachability in `poly-beta-api` Worker | Reachability in `poly-beta-dashboard` Pages |
|---|---|---|---|---|
| `better-auth` | `1.6.29` (vulnerable) | `1.7.7` (patched) | **Not imported** (`poly-beta-auth.ts` uses custom PBKDF2 + SHA-256 cookie auth) | **IMPORTED & REACHABLE** (`dashboard/src/lib/auth-client.ts:6` → `auth-store.ts`, `auth-guard.tsx`; served in pre-`#288` bundle `index-CGohBRkh.js`) |
| `proxy-addr` | `2.0.7` (vulnerable) | `2.0.8` (patched) | **Not imported** (Cloudflare Workers runtime, no Express) | **Not imported** (static SPA + Pages Functions) |

**Outstanding High-Severity Production Advisories on `87c8db9a` (`npm audit --omit=dev`):**
- `0 critical`, `8 high`: `@modelcontextprotocol/sdk`, `axios`, `body-parser`, `fast-uri`, `fastify`, `follow-redirects`, `undici`, `ws`.
- **Triage:** None of these 8 packages are imported by `src/platform/poly-beta/` (`poly-beta-worker.ts` uses Cloudflare Workers `fetch`, Web Crypto, D1, KV, DO only). However, they remain tracked for root monorepo hygiene and must not be assumed zero-risk on Node.js Express/Fastify paths.

---

## B4. Runtime Protections Verification (Non-Destructive)

| Control | Result | Evidence |
|---|---|---|
| `LIVE_TRADING_ENABLED=false` | **PASS** | `wrangler.poly-beta.toml` sets `LIVE_TRADING_ENABLED = "false"`; `poly-beta-worker.ts` returns HTTP `503` fail-closed if enabled |
| Zero CLOB signing keys in runtime | **PASS** | `wrangler secret list --config wrangler.poly-beta.toml` contains **only** `POLY_BETA_PROXY_SECRET` and `POLY_BETA_SESSION_SECRET` (values never printed) |
| No live order-submission / deposit / withdrawal path | **PASS** | Live `GET https://poly-beta-dashboard.pages.dev/api/beta/deposit` returned HTTP `403` `REAL_MONEY_OPERATIONS_DISABLED` (`REAL_MONEY_BLOCKED_PATTERNS` in `poly-beta-worker.ts`) |
| Tenant & D1/KV/DO isolation | **PASS** | Dedicated `poly-beta-db`, `POLY_BETA_KV`, `TenantPaperEngine` |
| Sticky `HALTED` kill switch & `$100` virtual starting equity / `$0` real funds | **PASS** | Verified in `src/platform/poly-beta/` Durable Object & config |
| **Private signup allowlist enabled** | **FAIL (GAP)** | `handleBetaSignup` (`src/platform/poly-beta/poly-beta-auth.ts:40-115`) enforces IP rate limiting (`10/60s`) only; **no invite code or email allowlist gate exists** |
| **Correct simulation & privacy disclosures on live site** | **FAIL (GAP)** | Live `GET https://poly-beta-dashboard.pages.dev/` `<title>`, `<meta>`, and JSON-LD serve commercial CashClaw copy (`"$49/mo Pro"`, `"$199/mo Enterprise"`, `"non-custodial CLOB bot"`) instead of isolated Paper Beta simulation/privacy disclosures |
| Safe rollback controls | **PASS** | `npx wrangler rollback --config wrangler.poly-beta.toml` + Cloudflare Pages deployment rollback |

---

## B5. Decision & Proposed Isolated Release Candidate Checklist

**Decision:** **`USER_001_INVITE = HOLD`**. Do not invite `USER_001` to the currently deployed `b65ede0e` / `9e73110c` artifacts.

**Required Before Requesting Separate Founder Approval to Redeploy & Invite `USER_001`:**
1. **Pin Immutable Provenance:** Inject `COMMIT_SHA` (and build timestamp / lockfile SHA-256) via CI deploy workflow into both `poly-beta-api` (`/api/health` returns exact Git SHA) and `poly-beta-dashboard` (immutable build metadata JSON).
2. **Patch Two Product/Security Gaps (Separate Narrow PR):**
   - Add fail-closed private signup allowlist (`BETA_SIGNUP_ALLOWLIST` or single-use invite token secret) to `handleBetaSignup` (`src/platform/poly-beta/poly-beta-auth.ts`).
   - Replace commercial CashClaw `<title>`/`<meta>`/JSON-LD on the Paper Beta Pages build with accurate `$100 virtual capital / $0 real funds / simulation-only` and privacy/data-retention disclosures.
3. **Rebuild from Patched Lockfile (`>= 87c8db9a`):** Confirm `better-auth@1.7.7` in the built `poly-beta-dashboard` bundle and `0 critical` advisories.
4. **Obtain Explicit Founder Deployment Approval:** Execute CI-driven deploy (no manual ad-hoc `version_upload`), verify live `/api/health` commit SHA matches `main`, verify allowlist rejects non-allowlisted signups, verify `/api/beta/deposit` returns `403`, and only then request Founder authorization to send the `USER_001` invitation.

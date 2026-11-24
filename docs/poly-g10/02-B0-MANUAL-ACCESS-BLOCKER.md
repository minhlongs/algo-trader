# POLY-G10 Phase 2 — Cloudflare B0 Manual Zero Trust Access Blocker

**Date:** 2026-11-23
**Repository:** `minhlongs/algo-trader` (`origin/main` = `b7bf721fc393a29da67e5ca383320692a6157ea3`)
**Gate Status:** `B0 = PARTIAL_OR_HOLD` | `B1_WORKER_DEPLOY = HOLD` | `B2_PAGES_DEPLOY = HOLD` | `USER_001_INVITE = HOLD`
**Policy:** Do **not** repeat identical Cloudflare read-only audits or open generic B0 audit PRs until an actual Zero Trust Access configuration change occurs. Do **not** disable authentication to unblock deployment.

---

## 1. Current Verified State (Founder-Reported + Source-Verified)

| Surface | State | Evidence / Notes |
|---|---|---|
| Worker `poly-beta-api` (`wrangler.poly-beta.toml`) | `workers_dev = false`, `preview_urls = false`, `routes = []` | Direct routes return 404; reachable only via Pages Service Binding `POLY_BETA_API`. Legacy Worker version unchanged (`9e73110c`). |
| Pages `poly-beta-dashboard` (`wrangler.poly-beta-pages.toml`) | **Publicly accessible** | Production hostname `https://poly-beta-dashboard.pages.dev` and 5 immutable deployment URLs remain publicly reachable without authentication. |
| Cloudflare Zero Trust Access Applications | **0 applications configured** | Identity-provider / One-Time PIN onboarding is incomplete or unverified. |
| Source locks (`wrangler.poly-beta.toml`) | **Intact** | `LIVE_TRADING_ENABLED="false"`, `MAINTENANCE_MODE="true"`, `MARKET_DATA_ENABLED="false"`, `SIGNUP_GATE_MODE="allowlist"`. |

Because Pages production and preview URLs remain unauthenticated, `B1_WORKER_DEPLOY` and `B2_PAGES_DEPLOY` stay on strict `HOLD`.

---

## 2. Exact Cloudflare Configuration Targets

| Parameter | Exact Value |
|---|---|
| **Cloudflare Account** | The exact Cloudflare account owning Worker `poly-beta-api` (D1 `poly-beta-db`, KV `POLY_BETA_KV`) and Pages project `poly-beta-dashboard` — **verify in Cloudflare Dashboard → Workers & Pages that `poly-beta-dashboard` appears before opening Zero Trust** |
| **Pages Project Name** | `poly-beta-dashboard` |
| **Production Hostname** | `poly-beta-dashboard.pages.dev` |
| **Preview Wildcard Hostname** | `*.poly-beta-dashboard.pages.dev` |
| **Access Policy Scope** | **Founder-only Allow** (explicit Founder email exact-match only; no wildcard domain, no `Everyone`, no bypass rules) |
| **Zero Trust Onboarding / IdP Prerequisite** | Cloudflare Zero Trust team initialized on the same account + **One-Time PIN (OTP)** login method enabled (or Founder's verified IdP) under **Zero Trust → Settings → Authentication → Login methods** |

---

## 3. Required Two Access Application Identities

Create and **save** two Self-Hosted Access Applications in **Zero Trust → Access → Applications**:

1. **Application 1 — Production Pages:**
   - **Name:** `poly-beta-dashboard-prod`
   - **Application domain:** `poly-beta-dashboard.pages.dev` (path: blank / all paths)
   - **Policy:** `Allow` → Include → `Emails` → Founder's exact email address
   - **Session duration:** `24 hours` (or shorter)
2. **Application 2 — Immutable Preview Deployments:**
   - **Name:** `poly-beta-dashboard-previews`
   - **Application domain:** `*.poly-beta-dashboard.pages.dev` (path: blank / all paths)
   - **Policy:** `Allow` → Include → `Emails` → Founder's exact email address
   - **Note:** Confirm Cloudflare Pages → `poly-beta-dashboard` → Settings → **Enable Access Policy** (or explicit Access application covering `*.poly-beta-dashboard.pages.dev`) so all 5 existing immutable deployment URLs are gated.

---

## 4. How to Detect Common Setup Traps

### A. Detecting an Unsaved Application
- After clicking through the wizard, return to **Zero Trust → Access → Applications** and hard-refresh the table.
- Both `poly-beta-dashboard.pages.dev` and `*.poly-beta-dashboard.pages.dev` must appear in the saved table with **Policies: 1** (not `0` and not missing).
- A draft abandoned on the Policy or Setup step leaves the application count at `0`.

### B. Distinguishing Wrong Account vs. Incomplete Onboarding
- **Wrong account:** In **Workers & Pages**, `poly-beta-dashboard` and `poly-beta-api` are **not listed**, or the Account ID in the dashboard URL does not match the account owning `poly-beta-db` / `POLY_BETA_KV`. Switch accounts in the top-left selector first.
- **Incomplete onboarding (right account):** `poly-beta-dashboard` **is** listed in Workers & Pages, but opening **Zero Trust** redirects to team-name / plan onboarding (Free tier `$0/mo` supports up to 50 users and One-Time PIN) or shows zero Login Methods under **Settings → Authentication**. Complete Zero Trust Free onboarding and enable One-Time PIN before creating the two applications.

---

## 5. Safe Verification Procedure (Zero Secrets Printed)

### Anonymous Verification (must fail closed to Access login)
Run from an unauthenticated shell (incognito / no cookies):

```bash
curl -sSI https://poly-beta-dashboard.pages.dev/ | grep -iE "^(HTTP/|location:)"
curl -sSI https://<one-of-the-5-immutable-hashes>.poly-beta-dashboard.pages.dev/ | grep -iE "^(HTTP/|location:)"
```

- **Expected PASS:** HTTP `302` redirect to `https://<team>.cloudflareaccess.com/cdn-cgi/access/login/...` (never HTTP `200` serving the app HTML).
- **Expected FAIL:** HTTP `200` or direct HTML response means the Access policy is not active on that hostname.

### Authenticated Verification (Founder browser)
1. Open `https://poly-beta-dashboard.pages.dev/` in a clean browser window.
2. Confirm redirect to Cloudflare Access login screen.
3. Request One-Time PIN to Founder email, authenticate, and confirm the dashboard loads only after OTP verification.
4. Repeat on one immutable `*.poly-beta-dashboard.pages.dev` deployment URL.

---

## 6. Single Precise Request for Founder Intervention

> **Action Requested:** In the Cloudflare account owning `poly-beta-dashboard`, complete Zero Trust Free onboarding + One-Time PIN login method, create and save the two Founder-only Access applications (`poly-beta-dashboard.pages.dev` and `*.poly-beta-dashboard.pages.dev`), and confirm both anonymous `curl -sSI` checks return HTTP `302` to `*.cloudflareaccess.com`. Once confirmed, request a separate **B1 approval packet** before any Worker or Pages deployment.

No secrets are requested or stored in this document. Offline Quant Track (Phases 3–14) proceeds independently with operational deployment kept on `HOLD`.

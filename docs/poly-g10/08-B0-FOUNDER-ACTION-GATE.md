# POLY-G10.3A — Cloudflare B0 Founder Action Gate

**Date:** 2026-11-24  
**Baseline:** `main` @ `68469cfeff09c82416778b1c09816d7005673c6c` (`G10_ENGINEERING_BASELINE = FROZEN`)  
**Supersedes / Operationalizes:** [`docs/poly-g10/02-B0-MANUAL-ACCESS-BLOCKER.md`](./02-B0-MANUAL-ACCESS-BLOCKER.md) (keeps prior evidence; adds verified current Cloudflare Pages Access UI procedure)  
**Status:** `TRACK_A = BLOCKED_OPERATOR_UI_ACTION` | `B0 = PARTIAL_OR_HOLD` | `B1 = HOLD` | `B2 = HOLD`

---

## 1. Preserved Verified State (No Redundant Audit Performed)

No Founder-reported Cloudflare Access UI change occurred after the last verified B0 check. Per `G10.3` Track A2, zero redundant Cloudflare Access API calls or 5-URL public probes were repeated.

| Surface | Last Verified State | Gate Impact |
|---|---|---|
| Worker `poly-beta-api` | `workers.dev` disabled; Preview URLs disabled; no custom domain; no zone routes; legacy version unchanged | Direct Worker ingress closed |
| Pages `poly-beta-dashboard` | Production (`poly-beta-dashboard.pages.dev`) publicly readable; 5 immutable deployment URLs publicly readable; **0** Access applications; operator auth unverified | **B0 remains `PARTIAL_OR_HOLD`** — Pages is **not** private |

---

## 2. Official Cloudflare Pages Procedure (Live-Verified `2026-11-24T13:07:00Z`)

**Official Sources:**
- `https://developers.cloudflare.com/pages/configuration/preview-deployments/` (retrieved `2026-11-24T13:07:00Z`)
- `https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain` (retrieved `2026-11-24T13:07:00Z`)

**Why two steps are required:** Clicking **Enable access policy** in Pages Settings protects **only** preview deployments (`*.poly-beta-dashboard.pages.dev`) and leaves the canonical production hostname (`poly-beta-dashboard.pages.dev`) public. Official Cloudflare Pages documentation requires converting the first generated policy to the production hostname, then re-enabling preview access so **two** Access applications exist.

### Exact Founder UI Steps (Correct Cloudflare Account, Zero Trust Onboarded, Auth Method Active)

1. Open **Cloudflare Dashboard → Workers & Pages → `poly-beta-dashboard`**.
2. Go to **Settings → General → Enable access policy** (creates the initial preview Access policy).
3. Click **Manage** on that newly created Access policy (opens **Zero Trust → Access controls → Applications**).
4. Select the `poly-beta-dashboard` application → click **Configure**.
5. Under **Public hostname**, in the **Subdomain** field, delete the wildcard (`*`) so the covered hostname is exactly `poly-beta-dashboard.pages.dev`. Rename the application (e.g., `poly-beta-dashboard-prod`) if Cloudflare requires a distinct name to avoid collision → **Save**.
6. Configure the **Policy** on this production application:
   - **Action:** `Allow`
   - **Include:** Founder's verified email / identity provider rule **only**
   - **Forbidden:** No `Everyone` rule; no `Bypass` rule.
7. Return to **Workers & Pages → `poly-beta-dashboard` → Settings → General → Enable access policy** a second time (re-creates protection for `*.poly-beta-dashboard.pages.dev`).
8. Open the second application in **Zero Trust → Access controls → Applications** and confirm:
   - Hostname scope is exactly `*.poly-beta-dashboard.pages.dev`
   - Policy is Founder-only `Allow` (no `Everyone`, no `Bypass`).
9. Test login in a private/incognito browser window:
   - Confirm unauthenticated access to `https://poly-beta-dashboard.pages.dev` and an immutable `https://<hash>.poly-beta-dashboard.pages.dev` URL redirects to Cloudflare Access (`302` to `*.cloudflareaccess.com`) rather than returning `200 OK` HTML.
   - Confirm the Founder can authenticate and load the page.

### If Blocked in Dashboard UI

Provide **only** a sanitized screenshot of:
- `Workers & Pages → poly-beta-dashboard → Settings → General` (Access policy section), **or**
- `Zero Trust → Access controls → Applications` (application list showing hostnames and policy names).

**Never share** OTP codes, API tokens, or session cookies.

---

## 3. Event-Driven Post-Action Verification Contract (Runs Only After Founder Confirms UI Setup)

Only after the Founder reports that both Access applications have been created/modified:

1. Read Access application metadata and confirm exact two scopes: `poly-beta-dashboard.pages.dev` and `*.poly-beta-dashboard.pages.dev`.
2. Confirm Founder-only `Allow` policies (zero `Everyone`, zero `Bypass`) and active authentication method.
3. Probe production and all 5 immutable preview URLs unauthenticated → verify rejection / Access redirect (`302`/`403`, never `200`).
4. Confirm authorized Founder access (or mark `NOT_VERIFIED` if live authenticated verification cannot be run safely).
5. Confirm Worker `poly-beta-api` ingress remains disabled and no unrelated changes occurred.
6. Keep `B1 = HOLD` and `B2 = HOLD` until separate explicit deployment approval.

---

## 4. Stop Condition

Until both Access applications exist and pass Section 3 verification:

```text
TRACK_A=BLOCKED_OPERATOR_UI_ACTION
B0=PARTIAL_OR_HOLD
B1=HOLD
B2=HOLD
USER_001_INVITE=HOLD
```

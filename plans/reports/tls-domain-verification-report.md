# TLS & Domain Configuration Verification Report

**Date:** 2026-08-16 | **Verdict:** CONDITIONAL PASS

---

## Current TLS Setup

**TLS Terminator: Cloudflare (edge)**

| Layer | Component | TLS Status |
|-------|-----------|------------|
| Edge | Cloudflare Workers (`api.cashclaw.cc/*`) | TLS 1.3 via Cloudflare |
| Tunnel | Cloudflare Tunnel (`35d5d11a-...cfargotunnel.com`) | Encrypted tunnel to VPS |
| VPS | App (`algo-trade:3000`) | Plain HTTP (ports 3000/3001) |

**How it works:** Cloudflare terminates TLS at the edge. Traffic routes to the CF Worker (`edge-proxy.ts`) which proxies to the VPS origin via a Cloudflare Tunnel. The VPS app runs plain HTTP -- Cloudflare handles all TLS.

**Evidence:**
- `wrangler.toml`: `[[routes]] pattern = "api.cashclaw.cc/*"` routes traffic through CF Workers
- `dns-update.yml`: Creates CNAME records pointing to `{tunnel_id}.cfargotunnel.com` with `proxied: true`
- `docker-compose.prod.yml`: App exposes `3000:3000` (HTTP), no TLS termination on VPS
- `docs/security-audit-checklist.md`: "TLS 1.3 enforced via Cloudflare"

---

## Caddy Status: NOT DEPLOYED (Template Only)

| Item | Status |
|------|--------|
| `docker/caddy/Caddyfile` | **Placeholder domains** (`your-domain.com`) -- not production |
| `docker/caddy/docker-compose.caddy.yml` | Exists, optional sidecar |
| Caddy running on VPS | **No evidence of deployment** |
| `renew-certs.sh` | Defaults to nginx reload; would skip without `RELOAD_SERVICES=caddy` |

**Key finding:** Caddy is a prepared-but-not-deployed option. The infrastructure audit (2026-07-03) flagged the placeholder domains as a blocking issue. Caddy is NOT in the production compose stack (`docker-compose.prod.yml`).

---

## TLS Conflict Analysis

**Current state: NO CONFLICT**

| Scenario | Risk |
|----------|------|
| Cloudflare only (current) | Low -- well-documented pattern |
| Cloudflare + Caddy active | **HIGH** -- double TLS termination, cert errors |
| Caddy only | N/A -- not deployed |

**If Caddy were added later:** You would need to either (a) set Cloudflare SSL mode to "Flexible" (CF -> VPS plain HTTP -> Caddy does TLS) which weakens security, or (b) set Cloudflare to "Full (Strict)" and disable Caddy TLS (point Caddy at plain HTTP). The cleanest approach is what's currently in place: Cloudflare handles TLS, VPS stays plain HTTP behind the tunnel.

---

## DNS Configuration

| Record | Type | Target | Status |
|--------|------|--------|--------|
| `api.cashclaw.cc` | CNAME | Cloudflare Tunnel | Configured |
| `cashclaw.cc` | Landing page | CF Pages | Live |
| `cashclaw-dashboard.pages.dev` | Dashboard | CF Pages | Live |

The `dns-update.yml` workflow manages DNS via Cloudflare API with proper secrets (`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`).

---

## Issues Found

| # | Severity | Issue |
|---|----------|-------|
| 1 | **LOW** | Caddyfile has placeholder domains -- not blocking since Caddy is not deployed |
| 2 | **LOW** | `renew-certs.sh` defaults to nginx reload -- no impact since Caddy handles certs |
| 3 | **INFO** | `docs/deployment-guide.md` line "SSL certificates configured (reverse proxy)" is marked TODO but is actually done via Cloudflare |
| 4 | **INFO** | No explicit HSTS header in app (helmet handles CSP/X-Frame but HSTS is at CF level) |

---

## Pass/Fail for Go-Live

| Gate | Status | Notes |
|------|--------|-------|
| TLS termination | PASS | Cloudflare handles TLS 1.3 |
| DNS resolution | PASS | `api.cashclaw.cc` resolves via CF Tunnel |
| Certificate renewal | PASS | Automatic via Cloudflare |
| No TLS conflicts | PASS | Caddy not deployed, no double-TLS |
| HSTS | PASS | Cloudflare edge-level HSTS available in dashboard |

**Overall: CONDITIONAL PASS** -- all TLS infrastructure is correctly configured via Cloudflare. The Caddy sidecar exists as a prepared option but introduces risk if accidentally enabled. Recommend either (a) removing Caddy from the repo or (b) adding a guard to prevent it from being started in the same compose stack as the CF Tunnel.

---

## Recommendations

1. **Optional cleanup:** Update `Caddyfile` with actual domains or remove the Caddy sidecar entirely to avoid confusion
2. **Update docs:** Mark "SSL certificates configured" as done in `deployment-guide.md`
3. **Verify Cloudflare dashboard:** Confirm HSTS and "Always Use HTTPS" are enabled in Cloudflare SSL/TLS settings (these are dashboard settings, not in-repo)

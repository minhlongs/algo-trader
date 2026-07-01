# Deployment Guide — cashclaw.cc

## Platform

Cloudflare Pages — Direct Upload (no git provider).

- **Project:** `algo-trader`
- **Domains:** `cashclaw.cc`, `www.cashclaw.cc`
- **Deploy command:** `./scripts/deploy-cf-pages.sh`

## Prerequisites

- `wrangler` CLI installed and authenticated (`npx wrangler whoami`)
- Source files in `landing/src/`

## Standard Deploy

```bash
cd ~/algo-trader/landing
./scripts/deploy-cf-pages.sh
```

## Quality Gates (run sequentially before upload)

1. **Source Check** — `index.html` + `tokens.css` must exist
2. **CSS Variable Audit** — Every `var(--xxx)` in HTML verified to exist in tokens.css
3. **Security Headers** — HSTS, CSP, X-Frame-Options, Permissions-Policy all present in `_headers`
4. **Secret Scan** — No API keys, tokens, or passwords in source

**Post-deploy verification:**
- HTTP 200 on deploy URL
- CSS integrity: file size + first line match
- Auto-generates deploy report in `plans/reports/deploy-*.md`

## Rollback

CF Pages keeps deployment history. To rollback:

```bash
# List deployments
npx wrangler pages deployment list --project-name algo-trader

# Note: direct upload projects cannot rollback via CLI.
# Use Cloudflare Dashboard: https://dash.cloudflare.com/ → Pages → algo-trader → Deployments
# Click "..." on the desired deployment → "Rollback to this deployment"
```

Or redeploy the previous source version:
```bash
git log --oneline landing/   # Find previous version
git checkout <commit> -- landing/src/
./scripts/deploy-cf-pages.sh
```

## CDN Cache

CF Pages caches assets at the edge:

- `/ui/*` files: `max-age=31536000, immutable` → **cache-bust with `?v=N` in HTML**
- `/*.html`: `no-cache, no-store, must-revalidate` → always fresh
- Custom domains may lag 2-4 hours behind `*.pages.dev` due to edge propagation

### Cache Busting Procedure

1. Increment version in `landing/.cache-version`
2. Update `<link href="...tokens.css?v=N">` in `index.html`
3. Deploy normally
4. Verify: `curl -sL "https://cashclaw.cc/ui/design-system/tokens.css?v=N" | head -3`

## Environment Variables

None required. This is a static site with no build step.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Old CSS on custom domain, new on `*.pages.dev` | CDN edge cache | Hard refresh (Cmd+Shift+R), or wait 2-4h |
| Gate 2 fails (CSS var audit) | HTML uses `var(--xxx)` not in tokens.css | Add missing variable to `:root` in tokens.css |
| Deploy 404 | Source files moved/deleted | Check `landing/src/` exists with `index.html` |
| Wrangler auth error | Token expired | `npx wrangler login` |

---
status: pending
priority: P0
---

# Phase 2: DNS Routing Fix

## Context
`api.cashclaw.cc` DNS is in gray-cloud (not publicly routable). No customer can reach billing endpoints even after webhook is mounted.

## Files to Investigate
1. `wrangler.toml` — CF Pages/Worker route config
2. `docs/deployment-guide.md` — DNS setup instructions
3. `docs/go-live-checklist.md` — DNS gray-cloud checklist item
4. CF Pages/Workers dashboard for route mapping

## Implementation Steps

1. Read `wrangler.toml` — check for route/bindings config
2. Read `docs/deployment-guide.md` — find DNS/domain setup instructions
3. Identify: is this a CF Pages custom domain mapping, or a Worker route?
4. If CF Worker: ensure `api.cashclaw.cc` route is deployed and DNS A/AAAA records point to CF
5. If CF Pages: add custom domain in Pages dashboard, verify SSL cert
6. Test: `curl -I https://api.cashclaw.cc/api/health` must return 200

## Success Criteria
- `https://api.cashclaw.cc` resolves publicly (not gray-cloud)
- SSL certificate valid (HTTPS)
- API health endpoint responds 200

## Risk
- DNS propagation can take 5-60 min
- May require domain registrar (Namecheap/Cloudflare) DNS record update

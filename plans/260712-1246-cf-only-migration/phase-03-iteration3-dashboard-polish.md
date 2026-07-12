---
phase: 3
title: "Iteration3-Dashboard-Polish"
status: pending
priority: P2
dependencies: [1, 2]
---

# Phase 3: Iteration3-Dashboard-Polish

## Overview
Deploy dashboard to CF Pages (quant.cashclaw.cc), wire all dashboard APIs to the Worker, and run end-to-end validation: signup → checkout → payment → tier upgrade → dashboard access.

## Requirements
- Functional:
  - Deploy dashboard to CF Pages at `quant.cashclaw.cc`
  - Wire dashboard APIs (co-pilot chat, subscriptions, markets) to Worker
  - E2E test: signup → checkout → payment → tier upgrade → dashboard access
- Non-functional:
  - Dashboard loads <2s on 3G
  - Auth-gated: redirect to `/login` if unauthenticated

## Related Code Files
- Create: CF Pages config + deploy script
- Modify: Dashboard src/api/ routes to point to `api.cashclaw.cc`
- Modify: Landing page links to point to `quant.cashclaw.cc`

## Implementation Steps
1. Create CF Pages project for `quant.cashclaw.cc`
2. Deploy dashboard static assets (if using React/Vite SPA)
3. Wire dashboard API routes to Worker:
   - Subscriptions → `api.cashclaw.cc/api/v1/subscriptions/me`
   - Co-pilot → `api.cashclaw.cc/api/copilot/ask`
   - Markets → `api.cashclaw.cc/api/markets/strategies`
4. Update landing page `cashclaw.cc` CTA links → `quant.cashclaw.cc`
5. E2E test:
   - Signup via API → get bearer token
   - Query `/api/v1/subscriptions/me` → FREE tier
   - Simulate NOWPayments IPN → tier upgrades to PRO
   - Query dashboard with PRO token → access co-pilot
6. Polish: loading states, error handling, rate limit UX

## Success Criteria
- [ ] `quant.cashclaw.cc` loads with auth check
- [ ] Dashboard APIs all return valid data from Worker
- [ ] E2E test passes: signup → payment → tier upgrade → dashboard
- [ ] Landing page links correct
- [ ] `pnpm build` → 0 errors
- [ ] Production: HTTP 200 on both domains

## Risk Assessment
| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| CF Pages CORS with Worker | Low | High | Configure CORS headers in Worker |
| Auth session desync | Medium | High | KV-backed sessions (already implemented) |
| Payment IPN not received | Medium | High | Have NOWPayments IPN URL ready before deploy |

---
title: "Brainstorm: Signals API Marketplace — Next Wave VIII"
created: "2026-07-04T09:41:00.000Z"
status: approved
---

# Signals API Marketplace — Next Wave VIII

## Architecture
Customer → subscribe → receive trading signals via REST API (polling/webhook).

## Pricing
- Basic: $29/mo, 1 sig/sec, no webhook, 1 day history
- Pro: $99/mo, 10 sig/sec, webhook, 7 day history
- Enterprise: $299/mo, 100 sig/sec, webhook, 30 day history

## Phases
```
Phase 1: Backend — signal publisher + subscription service + DB migration (054)
Phase 2: API — subscribe, feed, webhook endpoints + tier gating
Phase 3: Billing — NOWPayments integration for signal tiers
Phase 4: Verify & Merge
```

## Files
Create: signal-publisher.ts, signal-webhook-delivery.ts, signal-subscription-service.ts, signals-api-routes.ts, migration 054
Modify: server.ts, license.ts (add signal tiers), .env.example

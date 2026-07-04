# Phase 2: Real-Time Commission Tracking

**Priority**: P1 - Core Feature  
**Status**: Not Started  
**Effort**: 1.5 days  
**Dependencies**: Phase 1 (cookie attribution) complete

---

## Context Links

- **Plan**: `plans/260621-1618-affiliate-api-enhancements/plan.md`
- **WebSocket**: `src/api/ws-adapter-redis.ts` (existing Redis pub/sub)
- **Referral Service**: `src/referral/referral-service.ts` (commission creation)
- **Dashboard**: `dashboard/src/stores/referral-store.ts`

---

## Overview

Add real-time WebSocket notifications for commission events so affiliate partners see earnings updates instantly. Currently, commissions are created monthly in batch jobs, and partners must manually refresh the dashboard to see updates. Real-time push notifications improve partner engagement and trust.

---

## Key Insights

- **Events to publish**: `commission.created`, `commission.updated` (status changes)
- **Channel design**: `affiliate_commissions:{tenant_id}` - per-tenant channel for isolation
- **Authentication**: Affiliate API key (from Phase 4) or tenant JWT
- **Dashboard integration**: Subscribe to tenant's channel on page load; auto-update UI
- **Scalability**: Redis pub/sub already handles 1000+ connections; per-tenant channels limit broadcast scope
- **Reliability**: WebSocket auto-reconnect; missed events can be re-fetched via REST API

---

## Requirements

### Functional
1. **Publish events** when commissions created/updated:
   - `{ type: 'commission.created', data: CommissionRecord, tenantId }`
   - `{ type: 'commission.updated', data: CommissionRecord, changes: Partial<CommissionRecord>, tenantId }`
2. **WebSocket endpoint**: `wss://algo-trader.com/ws` (existing path)
3. **Subscribe**: Authenticated affiliate can `subscribe` to `affiliate_commissions:{tenantId}`
4. **Broadcast**: Push events to all connected clients subscribed to that tenant's channel
5. **Dashboard**: Auto-subscribe on load; update commission list in real-time
6. **Fallback**: If WebSocket disconnected, poll `/api/v1/referral/commissions?since=<timestamp>` every 30s

### Non-Functional
- Latency: < 2 seconds from commission creation to WebSocket receipt
- Connection limit: 1000 concurrent per tenant (horizontal scaling via Redis cluster)
- Message size: < 1KB per commission event
- Retry: Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s)
- Security: Only authenticated tenants can subscribe to their channel

---

## Architecture

### Event Flow

```typescript
// In ReferralService.processCommission():
const commission = await referralRepository.createCommission(...);
await wsAdapter.publish(`affiliate_commissions:${tenantId}`, {
  type: 'commission.created',
  data: commission,
  tenantId,
  timestamp: Date.now(),
});

// In runMonthlyPayout() when status changes:
await referralRepository.updateCommissionStatus(id, 'approved');
await wsAdapter.publish(`affiliate_commissions:${tenantId}`, {
  type: 'commission.updated',
  data: commission,
  changes: { status: 'approved' },
  tenantId,
});
```

### WebSocket Handler

Extend `RedisWSAdapter` with new channel `affiliate_commissions`:

```typescript
// config.channels push: 'affiliate_commissions'
// But subscription to specific tenant channel: 'affiliate_commissions:tenant_xyz'
// Client sends: { type: 'subscribe', channel: 'affiliate_commissions:tenant_xyz' }
// Server validates: req.affiliate.tenantId === parsed tenantId from channel
```

### Dashboard Store

Update `referral-store.ts` (Zustand):

```typescript
useEffect(() => {
  if (tenantId && wsConnected) {
    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: `affiliate_commissions:${tenantId}`
    }));
    // Handle incoming:
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.channel === `affiliate_commissions:${tenantId}`) {
        switch (msg.type) {
          case 'commission.created':
            setCommissions(prev => [msg.data, ...prev]);
            break;
          case 'commission.updated':
            setCommissions(prev => prev.map(c => c.id === msg.data.id ? msg.data : c));
            break;
        }
      }
    };
  }
}, [tenantId, wsConnected]);
```

---

## Related Code Files

**To Modify**:
- `src/referral/referral-service.ts` - publish events after commission create/update
- `src/api/ws-adapter-redis.ts` - add `affiliate_commissions` to config.channels
- `dashboard/src/stores/referral-store.ts` - WebSocket subscription logic
- `src/api/server.ts` - optionally expose WS auth validation

**To Create**:
- `src/referral/commission-websocket-handler.ts` - auth + subscription validation (optional, can inline)
- `dashboard/src/components/referral/real-time-commissions-widget.tsx` - UI component showing latest commissions with "live" indicator

**Tests**:
- `src/referral/__tests__/commission-websocket.test.ts` - mock Redis, verify publish
- `dashboard/src/stores/__tests__/referral-store-ws.test.ts` - mock WebSocket, verify state updates

---

## Implementation Steps

1. **Add channel to WebSocket config**:
   In `src/api/ws-adapter-redis.ts`:
   ```typescript
   const DEFAULT_CONFIG: WSAdapterConfig = {
     path: '/ws',
     channels: [
       // existing: 'trades', 'signals', 'orders', 'market-data', 'pnl', 'price_update'
       'affiliate_commissions',  // new (prefix channel; actual subscriptions are per-tenant)
     ],
     // ...
   };
   ```

2. **Create WebSocket auth middleware** (optional but recommended):
   In `src/referral/commission-websocket-handler.ts`:
   ```typescript
   export function validateAffiliateWsAuth(req: IncomingMessage): string | null {
     const apiKey = req.headers['x-affiliate-api-key'] as string | undefined;
     if (!apiKey) return null;
     // Validate HMAC signature or lookup in affiliate_api_keys table
     const tenantId = validateAffiliateKey(apiKey);
     return tenantId;
   }
   ```
   Update `ws-adapter-redis.ts` connection handler to call validator and attach `tenantId` to client.

3. **Enhance `RedisWSAdapter` subscription validation**:
   When client subscribes to `affiliate_commissions:tenantId`, verify that `client.tenantId === parsedTenantId`. Reject with error message if mismatch.

4. **Modify `ReferralService.processCommission()`**:
   ```typescript
   async processCommission(trackingId: string, revenueAmount: number): Promise<CommissionRecord> {
     // ... existing logic to create commission ...
     
     // Publish real-time event
     const tenantId = code.tenantId;
     if (this.wsAdapter) {
       await this.wsAdapter.publish(`affiliate_commissions:${tenantId}`, {
         type: 'commission.created',
         data: commission,
         tenantId,
         timestamp: Date.now(),
       });
     }
   }
   ```

5. **Modify `ReferralService.runMonthlyPayout()`** (status updates):
   Inside `approveCommissions()` loop, after `updateCommissionStatus`:
   ```typescript
   await this.wsAdapter?.publish(`affiliate_commissions:${tenantId}`, {
     type: 'commission.updated',
     data: commission,
     changes: { status: 'approved' },
     tenantId,
   });
   ```

6. **Inject WSAdapter into ReferralService**:
   - Add constructor param `wsAdapter?: RedisWSAdapter`
   - Set via DI in `src/app.ts`: `referralService.setWsAdapter(wsAdapter)`
   - Or use singleton pattern: `referralService.wsAdapter = wsAdapter` after server start

7. **Update dashboard store** (`dashboard/src/stores/referral-store.ts`):
   - Add `ws: WebSocket | null` state
   - `connectWs()`: open WS, subscribe to `affiliate_commissions:${tenantId}`
   - `disconnectWs()`: cleanup
   - Event handlers: update commissions state on `commission.created`/`.updated`
   - Reconnect logic on close (exponential backoff)

8. **Add real-time widget component**:
   Create `dashboard/src/components/referral/real-time-commissions-widget.tsx`:
   - Shows last 5 commissions with green "↑ +$X" animation on new commission
   - Live indicator (pulsing dot) when WS connected
   - "Reconnecting..." banner on disconnect

9. **Add fallback polling**:
   In store, if WS disconnected for >30s, start polling `/api/v1/referral/commissions?since=lastSeenTs` every 30s. Stop when WS reconnects.

10. **Write unit tests**:
    - Mock `wsAdapter.publish()`; verify called with correct channel/payload
    - Test `commission.created` and `commission.updated` events
    - Test WS auth: invalid tenantId rejected
    - Test subscription limit: max 10 channels per client

11. **Write integration tests**:
    - Spin up Redis + WS server; simulate commission creation; verify client receives event
    - Test reconnection: kill WS server, client reconnects, resubscribes
    - Test fallback polling: disable WS, verify REST poll fetches updates

12. **Load test**:
    ```bash
    k6 run tests/load/affiliate-ws-load-test.js
    ```
    - 500 concurrent WS connections subscribing to different tenant channels
    - 100 commission events/sec published
    - Measure message delivery latency

13. **Run typecheck & deploy**:
    ```bash
    pnpm run typecheck
    pnpm test src/referral/__tests__/commission-websocket.test.ts
    ```

---

## Todo List

- [ ] Add `affiliate_commissions` to WS adapter config.channels
- [ ] Implement WS auth validator for affiliate tenantId
- [ ] Create `RedisWSAdapter` subscription validation (tenantId check)
- [ ] Inject WSAdapter into ReferralService
- [ ] Publish `commission.created` in `processCommission()`
- [ ] Publish `commission.updated` in `runMonthlyPayout()`
- [ ] Update dashboard store: WS connect, subscribe, event handling
- [ ] Add real-time widget component
- [ ] Implement fallback polling (REST) when WS down
- [ ] Write unit tests (≥ 90% coverage)
- [ ] Write integration tests (full flow)
- [ ] Load test: 500 connections, 100 events/sec
- [ ] Run typecheck (0 errors)
- [ ] Deploy to staging; test with multiple browser tabs

---

## Success Criteria

- **Real-time latency**: < 2s from commission DB write to WS message received
- **Dashboard updates**: New commissions appear automatically without refresh
- **Connection stability**: < 1% disconnect rate under 500 concurrent
- **Reconnection**: Auto-reconnect within 5s, resubscribe correctly
- **Fallback**: Polling fetches updates if WS unavailable >30s
- **Security**: Unauthorized tenant cannot subscribe to other tenant's channel
- **Tests**: Unit ≥90%, integration 100%, load test passes

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WS connection limit exceeded (10k+ partners) | Low | Medium | Horizontal scale: add more Redis nodes, use channel sharding by tenantId hash |
| Message loss during Redis failover | Low | Medium | Use Redis Cluster with replicas; message durability via AOF |
| High event volume floods dashboard | Medium | Low | Debounce UI updates (batch 100ms), pagination (show last 50) |
| Browser compatibility (Safari WS issues) | Low | Low | Fallback to SSE; polyfill |
| Memory leak in WS clients | Low | Medium | Monitor `wsAdapter.getClientCount()`; auto-close stale connections |

---

## Security Considerations

- **Channel isolation**: Each tenant has dedicated channel `affiliate_commissions:{tenantId}`. No cross-tenant leakage.
- **Subscription auth**: Validate `client.tenantId` matches channel tenantId before allowing subscribe.
- **Rate limit subscriptions**: Max 10 channel subscriptions per client (defense in depth).
- **Message size**: Enforce < 1KB per event; truncate if needed.
- **No sensitive data**: Commission payload excludes `stripePayoutId` (admin-only).
- **Audit log**: Log all subscription attempts (tenantId, IP, user-agent).

---

## Next Steps

After Phase 2:
1. Phase 3: Enhanced reporting (date filters, CSV export)
2. Phase 4: Dedicated affiliate API keys (for WS auth)
3. Phase 5: Enhanced fraud detection (improves commission quality)

---

**Phase Status**: Not Started  
**Blockers**: Phase 1 completion (cookie attribution)  
**Next**: Begin implementation after Phase 1 tests pass

---
title: "Phase 04: Platform Depth"
description: "Add self-service API key management, real-time P&L streaming, real notification delivery, and community strategy sandbox execution."
status: pending
priority: P1 (item 1), P2 (items 2-4)
---

# Phase 04: Platform Depth

## Context

Scout 4 identified the platform has a surprisingly complete marketplace and subscription system but is missing developer self-service, real-time streaming for subscribers, notification delivery infrastructure, and community strategy sandboxing. These gaps reduce platform stickiness and growth velocity.

---

## Item 4.1: Self-service developer API key management UI + API

**Priority:** P1 | **Complexity:** L | **Estimated time:** 4-6 hours

### Context Links
- Scout 4, GAP 1: no self-service API key management

### Requirements
- PRO+ users can generate, revoke, and list API keys via the dashboard
- Each key has a label (to identify purpose) and rotation date
- Keys are hashed on storage (not plaintext), shown once at creation
- API keys authenticate via `Authorization: Bearer <key>` header
- Rate limiting per key (inherits tier rate limits)
- Revoking a key immediately invalidates it

### Files to Create/Modify
1. `/Users/macbook/algo-trader/src/platform/api/routes/api-keys.ts` (create) — CRUD for API keys
2. `/Users/macbook/algo-trader/src/platform/auth/api-key-auth.ts` (create) — middleware to validate Bearer token against hashed keys
3. `/Users/macbook/algo-trader/src/platform/api/middleware/feature-gate.ts` — add `requireApiKey` or extend `requireTier` to accept API key auth
4. `/Users/macbook/algo-trader/dashboard/src/pages/api-keys-page.tsx` (create) — dashboard page for key management
5. `/Users/macbook/algo-trader/dashboard/src/App.tsx` — add route to API keys page
6. `/Users/macbook/algo-trader/src/platform/db/migrations/` — add `api_keys` table migration

### Schema (`api_keys` table)
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  label VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,  -- first 8 chars for display
  key_hash TEXT NOT NULL,           -- bcrypt/scrypt hash
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
```

### Implementation Steps
1. Create migration for `api_keys` table
2. Create `api-key-auth.ts` middleware:
   - Extract Bearer token from `Authorization` header
   - Look up by `key_prefix` (avoid full table scan), then verify hash
   - Set `req.tenantId` from the key's tenant
   - Update `last_used_at`
3. Create `api-keys.ts` route:
   - `POST /api/v1/api-keys` — generate new key (label, optional expiry)
   - `GET /api/v1/api-keys` — list keys (prefix + label + created + last_used, NOT full hash)
   - `DELETE /api/v1/api-keys/:id` — revoke key (set `revoked_at`)
4. Create dashboard page with "API Keys" section:
   - Table of existing keys (label, prefix, created date, last used, revoke button)
   - "Generate New Key" button → shows key once with copy-to-clipboard
   - Revoke confirmation dialog

### Testing
- Unit: key generation returns full key once, stores hash
- Unit: auth middleware accepts valid key, rejects revoked key
- Unit: listing returns masked keys (prefix only)
- Integration: `POST /api/v1/api-keys` with valid auth → 201
- Integration: `GET /api/v1/strategies` with API key in header → 200
- Dashboard: visual check of API keys page

### Risks
- Key hashing: use scrypt or bcrypt, not SHA (rainbow table risk)
- Show-once pattern is critical — if user loses the key, they must regenerate

### Rollback
- Remove `api-keys` route, middleware, and dashboard page
- Migration rollback: `DROP TABLE api_keys`

---

## Item 4.2: Real-time P&L streaming for marketplace subscribers

**Priority:** P2 | **Complexity:** XL | **Estimated time:** 1-3 days

### Context Links
- Scout 4, GAP 3: no real-time P&L streaming for subscribers
- Existing WebSocket gateway at `/src/platform/api/websocket/` (verify path)

### Requirements
- Subscribers receive real-time P&L updates for their active strategy subscriptions
- Updates fire on every trade: position change, P&L change, drawdown update
- Uses existing WebSocket infrastructure (if available) or SSE (Server-Sent Events)
- Updates are per-subscriber (tenant isolated, one subscriber cannot see another's P&L)
- Include: current P&L (daily + total), open positions count, win rate, drawdown

### Files to Create/Modify
1. `/Users/macbook/algo-trader/src/platform/api/websocket/pnl-stream.ts` (create) — WebSocket handler for P&L updates
2. `/Users/macbook/algo-trader/src/desk/execution/live-position-tracker.ts` — emit P&L events after every trade update
3. `/Users/macbook/algo-trader/src/platform/marketplace/subscriber-executor.ts` — subscribe to P&L events for active subscriptions
4. `/Users/macbook/algo-trader/dashboard/src/hooks/usePnLStream.ts` (create) — React hook for WebSocket connection
5. `/Users/macbook/algo-trader/dashboard/src/pages/strategy-detail-page.tsx` — integrate P&L stream display

### Implementation Steps
1. **Event source:** Add a P&L event emitter to `LivePositionTracker` that fires on every trade record
2. **Event bus:** Use the existing NATS/event bus to broadcast P&L events (tenant-scoped)
3. **WebSocket handler:** Create a `pnl-stream.ts` WebSocket handler:
   - Authenticate via session or API key
   - Subscribe to P&L events for the subscriber's active subscriptions
   - Push JSON updates: `{ strategyId, dailyPnL, totalPnL, openPositions, winRate, maxDrawdown }`
4. **Dashboard:** Create `usePnLStream` hook:
   - Connect WebSocket on strategy detail page mount
   - Parse incoming P&L updates
   - Display as live-updating numbers on the strategy detail page
5. **Fallback:** If WebSocket is not available, implement SSE endpoint as alternative

### Testing
- Unit: P&L event emitter fires on trade record
- Integration: WebSocket connects and receives P&L updates for authorized subscriber
- Integration: Unauthorized WebSocket connection is rejected
- Dashboard: visual verification of live-updating P&L numbers

### Risks
- WebSocket connections scale to number of active subscribers. At low volume (single-digit concurrent) this is not a concern.
- NATS/event bus is the preferred transport — avoid building a separate pub/sub
- If P&L events are high-frequency, batch updates to once per second to avoid UI thrashing

### Rollback
- Remove WebSocket handler and dashboard hook; revert position tracker changes

---

## Item 4.3: Notification system — replace in-memory stub with real delivery

**Priority:** P2 | **Complexity:** L | **Estimated time:** 3-5 hours

### Context Links
- Scout 4: notification system is an in-memory stub with zero delivery infrastructure

### Requirements
- Replace the in-memory notification stub with a real notification service
- Support at least one delivery channel: email (via SendGrid, Resend, or SMTP)
- Support notification types: payment_failed, license_suspended, strategy_completed, dispute_filed
- Notifications have delivery status tracking (delivered, failed, pending)
- Notifications are persisted in the database (survive restarts)

### Files to Create/Modify
1. `/Users/macbook/algo-trader/src/platform/notifications/notification-service.ts` (create or rewrite) — notification dispatch logic
2. `/Users/macbook/algo-trader/src/platform/notifications/email-provider.ts` (create) — email transport adapter
3. `/Users/macbook/algo-trader/src/platform/notifications/notification-store.ts` (create) — DB persistence for notifications
4. `/Users/macbook/algo-trader/src/platform/db/migrations/` — add `notifications` table

### Schema (`notifications` table)
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  type VARCHAR(50) NOT NULL,       -- payment_failed, license_suspended, etc.
  channel VARCHAR(20) NOT NULL,     -- email, in_app
  recipient VARCHAR(255) NOT NULL,  -- email address or user ID
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, delivered, failed
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_status ON notifications(status);
```

### Implementation Steps
1. Create notification DB migration
2. Create `email-provider.ts`:
   - Supports SendGrid or SMTP via env var (`EMAIL_PROVIDER=sendgrid|smtp`)
   - `EmailProvider.send(to: string, subject: string, body: string): Promise<boolean>`
   - Graceful failure (logs warning, returns false, doesn't crash)
3. Create `notification-store.ts`:
   - Create, list, mark-delivered, mark-failed operations
4. Create `notification-service.ts`:
   - `dispatch(type, tenantId, recipient, subject, body)` — creates notification record, sends via provider, updates status
   - `getPendingNotifications()` — for retry worker
   - `retryFailed()` — BullMQ job to retry failed notifications every 5 min
5. Wire into existing event handlers:
   - Dunning service (already handled in Item 1.5 but use notification service instead of direct email)
   - Payment IPN handler
   - Marketplace dispute events
6. Replace in-memory stub references across the codebase

### Testing
- Unit: `dispatch()` creates DB record, sends email (mocked provider), updates status
- Unit: provider failure logs warning, marks notification as failed
- Unit: `retryFailed()` processes pending/failed notifications
- Integration: Wire into dunning and verify notification record created on payment failure

### Risks
- Adding notification delivery inside request-path handlers adds latency. Design `dispatch()` as async fire-and-forget with retry.
- Email provider credentials must be in env vars (already pattern in this codebase)

### Rollback
- Set `EMAIL_ENABLED=false` env var to disable email delivery
- Revert to in-memory notification stub
- Drop `notifications` table (migration rollback)

---

## Item 4.4: Community strategy sandbox — compile and execute uploaded strategies

**Priority:** P2 | **Complexity:** XL | **Estimated time:** 2-3 days

### Context Links
- Scout 4, GAP 2: community-uploaded strategies stored as text but never compiled or executed
- Depends on Item 2.1 (strategy wiring fix) for strategy infrastructure

### Requirements
- Community-uploaded strategies (TS/JS source code from `POST /api/community/strategies/upload`) must be compiled and validated
- Sandbox execution: run in a restricted environment (timeout, memory limit, no filesystem access)
- Automated vetting extends to compile check and sample execution
- Strategy failures in sandbox result in `vetting_failed` status with error details
- (Out of scope for this item: full VM isolation — scope is process-level sandboxing)

### Files to Create/Modify
1. `/Users/macbook/algo-trader/src/platform/community/sandbox-runner.ts` (create) — compile + sandbox execution logic
2. `/Users/macbook/algo-trader/src/platform/community/compiler.ts` (create) — TypeScript compilation for uploaded code
3. `/Users/macbook/algo-trader/src/platform/api/routes/community-routes.ts` — add sandbox validation step to upload
4. `/Users/macbook/algo-trader/src/platform/community/vetting-service.ts` — extend vetting to include sandbox results

### Implementation Steps
1. **Compiler (`compiler.ts`):**
   - Use `ts.createProgram()` or `esbuild` to compile uploaded TS code (isolated compilation)
   - Catch syntax errors, type errors — return structured error report
   - Verify the compiled output exports the required `IStrategy` interface
2. **Sandbox runner (`sandbox-runner.ts`):**
   - Use `vm2` or `isolated-vm` (preferred — npm package for sandboxed JS execution)
   - Timeout: 30s per execution
   - Memory limit: 64MB
   - No filesystem, network, or process access
   - Execute a sample tick (with mock market data) and capture output
   - Return success/failure + execution metrics (execution time, P&L from mock run)
3. **Vetting integration:**
   - When community strategy is uploaded (`POST /api/community/strategies/upload`):
     1. Save source as before
     2. Compile → if fails, return compile errors to user
     3. Sandbox: run 1-3 sample ticks
     4. Record results in vetting record
     5. Auto-set status based on compile + sandbox pass/fail
4. **Extend vetting criteria** (currently: Sharpe >= 1.0, maxDD <= 20%, winRate >= 45%, period >= 90 days):
   - Add "compiles successfully" and "sandbox execution completes without crash"

### Testing
- Unit: valid TS strategy compiles successfully
- Unit: invalid TS strategy returns structured errors
- Unit: sandbox rejects filesystem/network access attempts
- Unit: sandbox enforces timeout (infinite loop → timeout error)
- Integration: upload a strategy → compiles → sandbox runs → vetting updated
- Integration: upload a broken strategy → vetting_failed with error details

### Risks
- **Security is critical.** Uploaded code in the sandbox must not escape. Use `isolated-vm` which provides proper V8 isolate isolation.
- `isolated-vm` requires native compilation (C++ addon). Ensure the Docker image has build tools.
- CPU-intensive strategies may degrade platform performance. Enforce per-tenant sandbox CPU limits.
- The sandbox makes the vetting process slower (30s timeout). Run asynchronously (BullMQ job) rather than in the request path.

### Rollback
- Set `SANDBOX_ENABLED=false` env var — uploads skip sandbox validation (fall back to manual vetting only)
- Remove sandbox runner code

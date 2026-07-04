---
phase: 5
title: "Telegram Integration"
status: pending
priority: P1
effort: "~1h"
dependencies: [4]
---

# Phase 5: Telegram Integration

## Overview

Kết nối Alertmanager → Telegram Bot API cho CRITICAL alerts (daily loss, circuit breaker, provider down), và kích hoạt periodic P&L reporting từ code đã có.

## Related Code Files

- **Modify:** `config/alertmanager.yml` — add Telegram webhook receiver
- **Create:** `config/telegram-webhook.sh` — helper script cho Alertmanager
- **Read:** `src/platform/telegram/trading-alerts.ts` — code đã có cho P&L reports

## Implementation Steps

### Step 1: Create Telegram webhook handler for Alertmanager

Alertmanager supports webhook receivers. Create a simple bash/python script that Alertmanager calls:

**Option A: Alertmanager webhook receiver config (no script needed)**

Alertmanager có sẵn webhook config — không cần script nếu Telegram Bot API được gọi trực tiếp.

Update `config/alertmanager.yml`:

```yaml
route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'telegram-critical'
  routes:
    - match:
        severity: critical
      receiver: 'telegram-critical'
      repeat_interval: 1h
    - match:
        severity: warning
      receiver: 'telegram-warning'
      repeat_interval: 6h

receivers:
  - name: 'telegram-critical'
    webhook_configs:
      - url: 'http://localhost:3000/api/v1/telegram/alert'
        send_resolved: true
        http_config:
          basic_auth:
            username: 'admin'
            password: '${TELEGRAM_WEBHOOK_SECRET:-changeme}'

  - name: 'telegram-warning'
    webhook_configs:
      - url: 'http://localhost:3000/api/v1/telegram/alert'
        send_resolved: true
```

**Option B: Create a simple webhook receiver endpoint**

Or create a lightweight endpoint on the app that receives Alertmanager webhooks and forwards to Telegram.

Add route to platform API:

```typescript
// src/platform/api/routes/telegram-alert-routes.ts
// POST /api/v1/telegram/alert — receives Alertmanager webhook
// Validates auth header, formats message, sends via Telegram bot
```

### Step 2: Activate periodic P&L reporting

`trading-alerts.ts` đã có `startPeriodicPnlReport()` và `sendPnlSummary()`. Cần:

1. Gọi `startPeriodicPnlReport()` trong app startup
2. Đảm bảo `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` env vars được set
3. Wire `sendTradeAlert()` vào live position tracker events

**Where to add startup call:**

Trong `src/platform/api/server.ts` hoặc main app entry point:

```typescript
import { startPeriodicPnlReport } from '../telegram/trading-alerts';

// After server starts
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  startPeriodicPnlReport(6 * 60 * 60 * 1000); // every 6 hours
  logger.info('Periodic P&L reporting started (every 6h)');
}
```

### Step 3: Set environment variables

Required env vars:

```
TELEGRAM_BOT_TOKEN=<bot_token_from_BotFather>
TELEGRAM_CHAT_ID=<chat_id_for_alerts>
TELEGRAM_WEBHOOK_SECRET=<shared_secret>
```

### Step 4: Test the integration

```bash
# Simulate an alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{"labels":{"alertname":"TestAlert","severity":"critical"},"annotations":{"summary":"Test alert"}}]'

# Check Alertmanager alerts
curl http://localhost:9093/api/v2/alerts

# Verify Telegram receives alert (check chat)
```

## Success Criteria

- [ ] Alertmanager sends CRITICAL alerts to Telegram (daily loss, circuit breaker, provider down)
- [ ] Alertmanager sends WARNING alerts to Telegram (latency, data gaps, error rate)
- [ ] `startPeriodicPnlReport()` sends P&L summary every 6h
- [ ] `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env vars configured
- [ ] `TELEGRAM_WEBHOOK_SECRET` env var for webhook auth
- [ ] `pnpm typecheck` — 0 errors (nếu thêm route mới)

## Risk

- Telegram Bot API rate limits: max 20 messages/min. Mitigation: Alertmanager group_interval 5m
- Bot token lộ → ai cũng có thể gửi message từ bot. Mitigation: env var, không commit
- Webhook secret lộ → ai cũng có thể gửi alert giả. Mitigation: auth check trong handler

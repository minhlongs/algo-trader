# Brainstorm — algo-trader Go-Live Phase 2 (Platform-Only)

**Date:** 2026-06-30 | **Context:** CF-only backend deployed, platform-only go-live tiếp theo

## Problem

CF-only backend đã deploy (health, auth, stats, coupons). Còn 3 gaps cần close để platform go-live hoàn chỉnh:
1. Payment IPN webhook chưa có trên CF Worker (NOWPayments confirmation → tier activation)
2. Launch announcements chưa post
3. Monitoring chưa setup

Desk strategies (52+) tạm dừng — restart sau khi platform stable.

## Decision

**Platform-only first**: Hoàn thiện payment flow + content + monitoring trước. Desk restart sau.

### 1. Payment IPN Webhook → CF Worker

**Approach:** Port `nowpayments-webhook.ts` logic sang CF Worker handler mới.

Flow:
```
NOWPayments IPN → POST /api/webhooks/nowpayments → CF Worker
  → verify HMAC signature (env.NOWPAYMENTS_IPN_SECRET)
  → parse payment_status (confirmed/success)
  → ghi KV: `activation:{email}` → { tier, timestamp, invoiceId }
  → ghi log: `ipn-log:{timestamp}` → { status, body }
  → return 200 OK
```

New files:
- `src/platform/workers/webhook-handlers.ts` — IPN verify + activation logic
- Wire into `edge-proxy.ts` route table

Secrets needed: `NOWPAYMENTS_IPN_SECRET`

**Why this approach:** Đơn giản nhất, 1 file handler, tận dụng KV có sẵn. Không cần DB.

### 2. Launch Announcements

Nội dung ready-to-post trong `docs/marketing/golive-launch-content.md`:
- 8-tweet thread → manual post (X API không available)
- Discord + Reddit → manual post
- Follow-up T+24h

→ Không cần code. Checklist action items.

### 3. Monitoring

CF-native health monitoring:
- `/api/health` đã có (returns status + timestamp)
- Thêm IPN failure counter vào health response
- Option: CF Worker cron trigger health self-check mỗi 5ph

## Scope Boundary

| In | Out |
|----|-----|
| IPN webhook handler on CF Worker | NOWPayments invoice creation (đã có) |
| Webhook signature verification | Desk strategy execution |
| KV-based activation storage | Dashboard signal display (no signals yet) |
| Launch content posting checklist | Twitter/Discord API automation |
| Basic health + IPN monitoring | Grafana/Prometheus stack |
| NOWPAYMENTS_IPN_SECRET config | DB migrations |

## Risk

- **IPN không test được nếu không có NOWPayments test mode**: Cần tạo test invoice $1 để verify end-to-end
- **Desk offline → dashboard empty**: Cần thông báo "Signals coming soon" trên dashboard
- **Manual posting**: Có thể miss timing T+24h nếu không schedule trước

## Next Steps

1. Create plan via `/ck:plan`
2. Implement IPN webhook handler
3. Set NOWPAYMENTS_IPN_SECRET
4. Test end-to-end: landing → coupon → checkout → IPN → activation
5. Post launch content theo schedule
6. Health monitoring setup

# Production Readiness Runbook
# Hướng Dẫn Chuẩn Bị Triển Khai

> **Bilingual: English + Tiếng Việt**
> Date: 2026-08-13

---

## Overview / Tổng Quan

Algo Trader is code-complete (37 phases). This runbook covers the **manual steps** to go from code-complete to accepting real payments.

Algo Trader đã hoàn thành mã code (37 giai đoạn). Hướng dẫn này covers các **bước thủ công** để chuyển từ trạng thái hoàn thành mã sang trạng thái chấp nhận thanh toán thực.

---

## Step 1: Configure NOWPayments / Cấu Hình NOWPayments

### 1a. Create NOWPayments Account

1. Go to [nowpayments.io](https://nowpayments.io) → Sign Up
2. Complete email verification
3. Go to **Settings → API Keys** → Generate API Key
4. Go to **Settings → IPN Secret** → Copy IPN Secret
5. Go to **Settings → Invoice** → Copy Invoice ID for each tier:
   - Starter: `NOWPAYMENTS_INVOICE_STARTER`
   - Pro: `NOWPAYMENTS_INVOICE_PRO`
   - Enterprise: `NOWPAYMENTS_INVOICE_ENTERPRISE`

### 1b. Set IPN Callback URL

In NOWPayments dashboard → **IPN Settings**:

```
IPN Callback URL: https://api.cashclaw.cc/api/webhooks/nowpayments
```

This URL receives payment confirmations from NOWPayments.

### 1c. Set Environment Variables

On your Cloudflare Workers deployment, set these secrets:

```bash
# NOWPayments
NOWPAYMENTS_API_KEY=<your-api-key>
NOWPAYMENTS_IPN_SECRET=<your-ipn-secret>
NOWPAYMENTS_INVOICE_STARTER=<invoice-id-starter>
NOWPAYMENTS_INVOICE_PRO=<invoice-id-pro>
NOWPAYMENTS_INVOICE_ENTERPRISE=<invoice-id-enterprise>

# Telegram Bot (optional — only if using Telegram features)
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_CHANNEL_ID=<your-channel-id>

# LLM (for AI content generation and co-pilot)
LLM_PRIMARY_URL=http://omnimbp.local:20128/v1
LLM_PRIMARY_MODEL=deepseek-v4-flash

# Security
JWT_SECRET=<generate-random-64-char-string>
```

**Câu lệnh thiết lập (macOS/Linux):**

```bash
npx wrangler secret put NOWPAYMENTS_API_KEY
npx wrangler secret put NOWPAYMENTS_IPN_SECRET
npx wrangler secret put JWT_SECRET
```

---

## Step 2: Deploy / Triển Khai

### 2a. Cloudflare Workers (Recommended)

```bash
cd apps/algo-trader
npm run build
npx wrangler deploy
```

### 2b. Verify SHA Match

```bash
# Get local SHA
LOCAL_SHA=$(git rev-parse HEAD | cut -c1-8)

# Get live SHA
LIVE_SHA=$(curl -s https://api.cashclaw.cc/api/version | grep -o '"shortSha":"[^"]*"' | cut -d'"' -f4)

echo "Local: $LOCAL_SHA  Live: $LIVE_SHA"
# Must match!
```

---

## Step 2c: Configure SendGrid Email / Cấu Hình SendGrid Email

Email is critical for user onboarding, trial conversion, and payment receipts. SendGrid powers all transactional email in CashClaw.

Email là thành phần quan trọng cho onboarding người dùng, chuyển đổi trial, và hóa đơn thanh toán. SendGrid xử lý toàn bộ email giao dịch trong CashClaw.

### 2c.1. Create SendGrid Account / Tạo Tài Khoản SendGrid

1. Go to [sendgrid.com](https://sendgrid.com) → Sign Up
2. Complete email verification
3. Go to **Settings → API Keys → Create API Key**
4. Select **Mail Send** permission
5. Copy the API key (shown once — save it securely)

### 2c.2. Set Up DNS Authentication / Thiết Lập Xác Thực DNS

For the `cashclaw.cc` domain, add these DNS records in your domain registrar:

| Type | Host | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:sendgrid.net ~all` |
| CNAME | `s1._domainkey` | `s1.domainkey.u12345.wl.sendgrid.net` |
| CNAME | `s2._domainkey` | `s2.domainkey.u12345.wl.sendgrid.net` |
| CNAME | `em1234` | `u12345.wl.sendgrid.net` |

Wait 24–48 hours for DNS propagation, then verify in SendGrid dashboard → **Settings → Sender Authentication → Authenticate Your Domain**.

### 2c.3. Set Environment Variables / Thiết Lập Biến Môi Trường

```bash
# SendGrid (required for email features)
SENDGRID_API_KEY=<your-api-key>
SENDGRID_FROM_EMAIL=alerts@cashclaw.cc
SENDGRID_FROM_NAME=CashClaw

# Cloudflare Workers secret setup:
npx wrangler secret put SENDGRID_API_KEY
npx wrangler secret put SENDGRID_FROM_EMAIL
npx wrangler secret put SENDGRID_FROM_NAME
```

### 2c.4. Verify Email Sending / Xác Minh Gửi Email

```bash
curl -X POST https://api.cashclaw.cc/api/v1/test-email \
  -H "Content-Type: application/json" \
  -d '{"to": "your@email.com", "type": "welcome"}'
```

Expected: HTTP 200 + email arrives in inbox (check spam folder if not in inbox).

### What SendGrid Powers / SendGrid Xử Lý Gì

| Feature | Description | Description (VN) |
|---------|-------------|------------------|
| Welcome drip | Day 0, 1, 3 — new user onboarding | Ngày 0, 1, 3 — onboarding người dùng mới |
| Trial drip | Day 1, 3, 5, 7 — trial-to-paid conversion | Ngày 1, 3, 5, 7 — chuyển đổi trial thành paid |
| Invoice emails | Payment receipts for completed transactions | Biên lai thanh toán cho giao dịch hoàn tất |
| Usage alerts | Threshold alerts at 75%, 90%, 95%, 100% | Cảnh báo ngưỡng sử dụng tại 75%, 90%, 95%, 100% |

---

## Step 3: Run Smoke Tests / Chạy Kiểm Tra

```bash
# Run protected-flows smoke test
node scripts/smoke-test-protected-flows.mjs

# Expected output:
# ✓ Health check: HTTP 200
# ✓ Setup Wizard (credentials): HTTP 403
# ✓ NOWPayments IPN webhook: HTTP 400
# ✓ Telegram bot webhook: HTTP 200
# ✅ ALL SMOKE TESTS PASSED
```

---

## Step 4: Test First Payment / Kiểm Tra Thanh Toán Đầu Tiên

1. Open the app at `https://cashclaw.cc`
2. Click **Pricing** → Select **PRO** plan
3. Click **Subscribe** → You should see a NOWPayments invoice page
4. Complete payment with USDT (TRC20)
5. Verify: NOWPayments dashboard shows payment as **finished**
6. Verify: Your subscription tier upgrades to **PRO**

### If payment doesn't activate:

1. Check NOWPayments IPN logs at: **NOWPayments Dashboard → IPN → Logs**
2. Check production logs: `npx wrangler tail`
3. Verify `NOWPAYMENTS_IPN_SECRET` is correctly set

---

## Step 5: Set Up Telegram Bot (Optional)

### 5a. Create Telegram Bot

1. Open Telegram → Search `@BotFather`
2. Send `/newbot` → Follow prompts
3. Copy the bot token

### 5b. Set Webhook

```bash
curl -X POST https://api.cashclaw.cc/api/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.cashclaw.cc/api/telegram/webhook"}'
```

### 5c. Test Bot

1. Open your bot in Telegram
2. Send `/status` → Should return your subscription tier

---

## Troubleshooting / Xử Lý Sự Cố

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| NOWPayments invoice page blank | API key not set | Check `NOWPAYMENTS_API_KEY` secret |
| Payment not activating tier | IPN not configured | Check `NOWPAYMENTS_IPN_SECRET` + callback URL |
| Health check returns 500 | Deployment error | Check `npx wrangler tail` logs |
| Telegram bot not responding | Webhook not set | Re-run `set-webhook` curl command |
| 403 on credentials endpoint | Normal behavior | Endpoint requires JWT auth — 403 = endpoint alive |
| SendGrid emails not sending | API key missing or wrong domain | Check `SENDGRID_API_KEY` secret + verify DNS auth |

---

## Support / Hỗ Trợ

- **Logs**: `npx wrangler tail`
- **NOWPayments status**: [status.nowpayments.io](https://status.nowpayments.io)
- **SendGrid status**: [status.sendgrid.com](https://status.sendgrid.com)
- **CashClaw status**: `https://api.cashclaw.cc/health`

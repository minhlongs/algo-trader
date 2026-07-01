# NOWPayments Setup + Marketplace E2E Test Guide

**Date:** 2026-07-01 | **Prerequisites:** NOWPayments merchant account, Docker installed

## 1. NOWPayments API Keys

### Get your keys
1. Go to https://nowpayments.io → Sign up / Login
2. Dashboard → Store Settings → API Keys
3. Create or copy:
   - **API Key** — for creating invoices (`NOWPAYMENTS_API_KEY`)
   - **IPN Secret Key** — for verifying webhook HMAC signatures (`NOWPAYMENTS_IPN_SECRET`)

### Set env vars

Add to `/Users/macbook/algo-trader/.env`:

```bash
NOWPAYMENTS_API_KEY=your_api_key_here
NOWPAYMENTS_IPN_SECRET=your_ipn_secret_here
NOWPAYMENTS_IPN_URL=https://api.cashclaw.cc/api/webhooks/nowpayments
```

### CF Worker secret

```bash
cd /Users/macbook/algo-trader
npx wrangler secret put NOWPAYMENTS_IPN_SECRET
# Paste the IPN Secret Key when prompted
```

## 2. Verify Webhook Reachability

```bash
# Test CF Worker is live
curl -s https://api.cashclaw.cc/api/version | jq .

# Test webhook endpoint (should return 405 Method Not Allowed for GET)
curl -s -o /dev/null -w "%{http_code}" https://api.cashclaw.cc/api/webhooks/nowpayments
# Expected: 405 (POST-only endpoint)
```

## 3. Marketplace E2E Smoke Test

### 3.1 Start Docker Stack

```bash
cd /Users/macbook/algo-trader
docker compose up -d
# Wait for all services healthy
docker compose ps
```

### 3.2 Verify Dashboard

```bash
cd /Users/macbook/algo-trader/dashboard
npm run dev
# Open http://localhost:5173 → Marketplace
```

### 3.3 Test Flow

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open Marketplace → Browse tab | 5 strategies with prices ($79-$149/mo) |
| 2 | Click Subscribe on any strategy | Modal with allocation slider |
| 3 | Set allocation 25%, click Subscribe | Checkout modal with "Pay with USDT" |
| 4 | Click "Pay with USDT" | Opens NOWPayments invoice in new tab |
| 5 | Complete payment (testnet/sandbox) | NOWPayments confirms payment |
| 6 | Wait for IPN webhook | Subscription activates (can take 1-5 min) |
| 7 | Click "I already paid" or wait | Dashboard shows subscription as "Active" |
| 8 | Go to My Subscriptions | Card shows strategy name, P&L, status "Active" |
| 9 | Click Execute | Strategy runs, shows signal/profit result |
| 10 | Click Pause | Status changes to "Paused" |
| 11 | Click Resume | Status changes back to "Active" |
| 12 | Click Cancel → Confirm | Status changes to "Cancelled" |

### 3.4 Verify Backend

```bash
# Check subscription in DB
docker compose exec postgres psql -U postgres -d algotrader \
  -c "SELECT id, tenant_id, status, payment_status FROM marketplace_subscriptions;"

# Check execution logs
docker compose logs api | grep "Auto-execution"

# Check IPN webhook logs  
docker compose logs api | grep "Marketplace payment"
```

## 4. Production Dry Run

After testnet verification:
- [ ] Deploy to production: `npm run deploy:full`
- [ ] Verify SHA: `curl -s https://sophia.agencyos.network/api/version | jq '.shortSha'`
- [ ] Run same E2E flow with real NOWPayments (small amount ~$1)
- [ ] Verify production IPN delivered
- [ ] Verify real subscription activation + execution

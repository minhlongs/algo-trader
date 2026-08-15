# Production Verification Checklist

> Pre-launch verification. Run through each section before beta pilot.

**Last updated:** 2026-08-14
**Owner:** Engineering lead
**Status:** In progress

---

## 1. API Endpoints

### Health Check
```bash
curl -s https://api.cashclaw.cc/health | jq
# Expected: { "status": "ok", "version": "3.1.9", "redis": "ok", "postgres": "ok" }
```

### Core Endpoints
| Endpoint | Method | Auth | Expected |
|----------|--------|------|----------|
| `/health` | GET | None | 200 + status JSON |
| `/api/v1/onboarding/signup` | POST | None | 200 + pendingId |
| `/api/v1/onboarding/verify` | POST | None | 200 + license |
| `/api/v1/strategies` | GET | Bearer | 200 + strategy list |
| `/api/v1/marketplace` | GET | None | 200 + marketplace list |
| `/api/v1/co-pilot/ask` | POST | Bearer | 200 + AI response |

### Risk Endpoints (when ENABLE_RISK_ENGINE=true)
| Endpoint | Method | Auth | Expected |
|----------|--------|------|----------|
| `/api/v1/risk/var` | POST | PRO+ | 200 + VaR result |
| `/api/v1/risk/correlation` | POST | PRO+ | 200 + correlation matrix |
| `/api/v1/risk/drawdown` | GET | PRO+ | 200 + drawdown status |
| `/api/v1/risk/atr/stop/:symbol` | GET | PRO+ | 200 + ATR state |
| `/api/v1/risk/kelly/size` | POST | PRO+ | 200 + Kelly sizing |

### Verification Script
```bash
#!/bin/bash
BASE="https://api.cashclaw.cc"

echo "1. Health check..."
curl -sf "$BASE/health" | jq .status || echo "FAIL: health"

echo "2. Signup flow..."
SIGNUP=$(curl -sf -X POST "$BASE/api/v1/onboarding/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","tier":"FREE"}')
echo "$SIGNUP" | jq .pendingId || echo "FAIL: signup"

echo "3. Strategy list..."
curl -sf "$BASE/api/v1/strategies" | jq .length || echo "FAIL: strategies"

echo "4. Marketplace..."
curl -sf "$BASE/api/v1/marketplace" | jq .length || echo "FAIL: marketplace"

echo "Done. Review any FAIL entries above."
```

---

## 2. Payment Flow (NOWPayments)

### End-to-End Test
1. **Create invoice:**
   ```bash
   curl -X POST https://api.cashclaw.cc/api/v1/nowpayments/create-invoice \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tier":"PRO","email":"test@example.com"}'
   # Expected: { "invoice_id": "...", "invoice_url": "https://nowpayments.io/..." }
   ```

2. **Simulate IPN callback:**
   ```bash
   curl -X POST https://api.cashclaw.cc/api/webhooks/nowpayments \
     -H "Content-Type: application/json" \
     -d '{"payment_id":"test-001","payment_status":"finished","price_amount":99,"price_currency":"USD","invoice_id":"..."}'
   # Expected: 200 OK, license activated
   ```

3. **Verify license:**
   ```bash
   curl -s https://api.cashclaw.cc/api/v1/license/status \
     -H "Authorization: Bearer $TOKEN" | jq .tier
   # Expected: "PRO"
   ```

### Verification Checklist
- [ ] Invoice creation returns valid NOWPayments URL
- [ ] IPN signature verification works (HMAC-SHA512)
- [ ] License activated on successful payment
- [ ] Tier limits enforced after activation
- [ ] Payment failure logged, user notified
- [ ] Coupon codes work (BETA50 for 50% off)

---

## 3. Email Delivery (SendGrid)

### Test
```bash
curl -X POST https://api.cashclaw.cc/api/v1/test-email \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"test@example.com","template":"welcome"}'
# Expected: 200 OK, email delivered
```

### Verification Checklist
- [ ] SENDGRID_API_KEY configured in production env
- [ ] SENDGRID_FROM_EMAIL verified domain
- [ ] Verification email delivers (check spam folder)
- [ ] Welcome drip sequence sends on schedule
- [ ] Risk alert emails trigger on drawdown breach
- [ ] Payment confirmation email sends on subscription

### Known Issues
- SendGrid API key status unclear in production
- Domain verification may be needed for custom sender
- Fallback: Telegram alerts if email fails

---

## 4. Dashboard + WebSocket

### Dashboard Load
```bash
curl -s https://cashclaw.cc | head -20
# Expected: HTML with React app bundle
```

### WebSocket Connection
```bash
# Using wscat or browser devtools
wscat -c wss://api.cashclaw.cc/ws
# Expected: Connection established, receive initial state
```

### Verification Checklist
- [ ] Dashboard loads without console errors
- [ ] WebSocket connects on page load
- [ ] Live price data streams to dashboard
- [ ] Strategy P&L updates in real-time
- [ ] Leaderboard updates on trade execution
- [ ] Reconnection works after disconnect (jitter enabled)
- [ ] Message replay buffer works (last 50 messages)

---

## 5. Risk Engine Calculations

### Enable Risk Engine
```bash
# In production env
ENABLE_RISK_ENGINE=true
```

### Test Calculations
```bash
# VaR computation
curl -X POST https://api.cashclaw.cc/api/v1/risk/var \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"positions":[{"symbol":"ETH","quantity":10,"price":3500}],"confidence":0.95,"horizon":"1d"}'
# Expected: { "var": ..., "cvar": ..., "confidence": 0.95 }

# Kelly sizing
curl -X POST https://api.cashclaw.cc/api/v1/risk/kelly/size \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"winRate":0.55,"avgWin":0.03,"avgLoss":0.02}'
# Expected: { "kellyFraction": ..., "recommendedSize": ... }

# Drawdown status
curl -s https://api.cashclaw.cc/api/v1/risk/drawdown \
  -H "Authorization: Bearer $TOKEN"
# Expected: { "dailyDrawdown": ..., "totalDrawdown": ..., "canTrade": true }
```

### Verification Checklist
- [ ] VaR/CVaR calculations return valid numbers
- [ ] Correlation matrix computes for multi-position portfolios
- [ ] Drawdown monitor tracks 24h rolling P&L
- [ ] ATR trailing stops update on price changes
- [ ] Kelly sizing respects position limits
- [ ] Circuit breaker halts trading on drawdown breach
- [ ] Risk cache invalidation works
- [ ] Tier-gated access enforced (PRO+ only)

---

## 6. Marketplace (Strategy Publish/Subscribe)

### Test
```bash
# List available strategies
curl -s https://api.cashclaw.cc/api/v1/marketplace | jq .length
# Expected: 52+ strategies

# Subscribe to strategy (PRO tier)
curl -X POST https://api.cashclaw.cc/api/v1/marketplace/subscribe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"strategyId":"rsi-oversold"}'
# Expected: 200 OK, subscription active

# Publish custom strategy (ENTERPRISE tier)
curl -X POST https://api.cashclaw.cc/api/v1/marketplace/publish \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Strategy","config":{...}}'
# Expected: 200 OK, strategy published
```

### Verification Checklist
- [ ] Strategy marketplace loads all 52+ strategies
- [ ] Strategy subscription respects tier limits
- [ ] Custom strategy publish works (ENTERPRISE only)
- [ ] Strategy performance tracking updates
- [ ] Revenue sharing calculations work
- [ ] Strategy error handling (disable on failure)

---

## 7. Co-pilot Integration

### Test
```bash
curl -X POST https://api.cashclaw.cc/api/v1/co-pilot/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is my current P&L?"}'
# Expected: 200 OK, AI response with P&L data
```

### Verification Checklist
- [ ] Co-pilot proxies to VPS with real data
- [ ] Natural language queries return accurate responses
- [ ] P&L queries reflect live trading data
- [ ] Strategy recommendations based on market regime
- [ ] Error handling for malformed queries

---

## 8. Infrastructure Health

### Services Status
| Service | Status | How to Check |
|---------|--------|-------------|
| PostgreSQL | [ ] | `psql -h $DB_HOST -c "SELECT 1"` |
| Redis | [ ] | `redis-cli -h $REDIS_HOST ping` |
| SendGrid | [ ] | API key valid, domain verified |
| NOWPayments | [ ] | API key valid, IPN secret set |
| Cloudflare Workers | [ ] | `curl -s https://api.cashclaw.cc/health` |
| Sentry | [ ] | Error tracking active |
| Grafana | [ ] | Dashboards loading |

### Performance Baseline
| Metric | Target | Current |
|--------|--------|---------|
| API p95 latency | <100ms | [ ] measure |
| Error rate | <1% | [ ] measure |
| Memory usage | <115MB | [ ] measure |
| WebSocket latency | <50ms | [ ] measure |

---

## Sign-off

| Area | Owner | Verified | Date |
|------|-------|----------|------|
| API Endpoints | Engineering | [ ] | ___ |
| Payment Flow | Engineering | [ ] | ___ |
| Email Delivery | DevOps | [ ] | ___ |
| Dashboard + WS | Frontend | [ ] | ___ |
| Risk Engine | Engineering | [ ] | ___ |
| Marketplace | Engineering | [ ] | ___ |
| Co-pilot | AI Team | [ ] | ___ |
| Infrastructure | DevOps | [ ] | ___ |

**Final approval:** [ ] CEO / [ ] CTO
**Launch date:** ___

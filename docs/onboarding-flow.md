# Onboarding Flow

> User journey from signup to active trader. Each step's emails, actions, and failure modes.

---

## Flow Diagram

```
Signup (email + tier)
    |
    v
Email Verification (6-digit code, 15min TTL)
    |
    v
License Activation (creates DB record)
    |
    v
Dashboard Access (auto-login or manual)
    |
    v
API Key Setup (Polymarket or exchange)
    |
    v
Paper Trading (default mode)
    |
    v
Strategy Selection (marketplace or custom)
    |
    v
Live Trading (optional, risk engine required)
```

---

## Step Details

### 1. Signup (`POST /api/v1/onboarding/signup`)

**User action:** Enter email, select tier

**Backend:**
- Validate email format
- Check for duplicate (existing active license)
- Generate 6-digit verification code
- Store in `onboarding_signups` table (TTL: 15min)
- Send verification email

**Email sent:** Verification code (expires in 15min)

**Failure modes:**
- Duplicate email -> "Account exists, login instead"
- Invalid format -> "Please enter a valid email"
- DB error -> Retry or contact support

---

### 2. Email Verification (`POST /api/v1/onboarding/verify`)

**User action:** Enter 6-digit code from email

**Backend:**
- Validate code matches + not expired
- Mark signup as verified
- Create license record in `licenses` table
- Set tier based on signup request

**Email sent:** Welcome email with dashboard link + quick-start guide

**Failure modes:**
- Expired code -> Resend verification email
- Wrong code -> "Invalid code, try again"
- Already verified -> Redirect to dashboard

---

### 3. Dashboard Access

**User action:** Click dashboard link or navigate to dashboard URL

**Backend:**
- Authenticate via Better Auth
- Load user profile + license tier
- Connect WebSocket for live data
- Initialize paper trading mode

**Email sent:** Welcome email drip sequence (3 emails over 7 days)

**Failure modes:**
- Auth expired -> Re-login prompt
- WebSocket disconnect -> Auto-reconnect with jitter
- Tier mismatch -> Refresh license from DB

---

### 4. API Key Setup (`POST /api/v1/onboarding/api-keys`)

**User action:** Add exchange API keys (Polymarket, Binance, etc.)

**Backend:**
- Validate API key format
- Test connectivity to exchange
- Encrypt and store in `exchange_keys` table
- Enable market data feeds

**Email sent:** None (in-app confirmation)

**Failure modes:**
- Invalid key -> "API key validation failed, check credentials"
- Exchange down -> "Exchange temporarily unavailable, retry later"
- Rate limited -> "Too many attempts, wait 5 minutes"

---

### 5. Paper Trading

**User action:** Enable paper mode (default: ON)

**Backend:**
- Simulate order execution
- Track P&L in `paper_trades` table
- Update dashboard leaderboard
- Generate strategy performance metrics

**Email sent:** None

**Failure modes:**
- Simulated fill fails -> Log error, continue
- P&L calculation error -> Fallback to simple tracking

---

### 6. Strategy Selection

**User action:** Browse marketplace, subscribe to strategies

**Backend:**
- Check tier limits (FREE: 3, PRO: 15, ENTERPRISE: 50)
- Create strategy subscription
- Start strategy execution (paper or live)
- Track performance per strategy

**Email sent:** None (in-app notification)

**Failure modes:**
- Tier limit reached -> "Upgrade to add more strategies"
- Strategy error -> Disable strategy, notify user
- Performance degradation -> Auto-disable, alert

---

### 7. Live Trading (Optional)

**User action:** Disable paper mode, enable live execution

**Backend:**
- Require risk engine enabled (`ENABLE_RISK_ENGINE=true`)
- Validate position sizing (Kelly criterion)
- Check drawdown limits
- Execute via CLOB API
- Record in `live_trades` table

**Email sent:** Live trading activation confirmation

**Failure modes:**
- Risk gate denied -> "Position size exceeds risk limits"
- Exchange error -> Retry with exponential backoff
- Drawdown breach -> Halt trading, alert user

---

## Email Sequence

### Welcome Drip (3 emails over 7 days)

| Day | Subject | Content |
|-----|---------|---------|
| 0 | Welcome to CashClaw | Dashboard link, quick-start guide, API key setup |
| 3 | Your first strategy | Strategy marketplace walkthrough, paper trading tips |
| 7 | Ready for live trading? | Risk engine overview, position sizing, go-live checklist |

### Transactional Emails

| Trigger | Subject | Content |
|---------|---------|---------|
| Signup | Verify your email | 6-digit code, expires in 15min |
| Verification | Welcome aboard! | Dashboard link, quick-start guide |
| Payment | Payment confirmed | Invoice details, tier activation |
| Risk alert | Drawdown warning | Current P&L, recommended actions |
| Support | We got your message | Ticket confirmation, expected response time |

---

## Support Request Handling

### Channels
1. **Email:** support@cashclaw.cc (auto-reply within 1hr)
2. **Discord:** #beta-support (community + team monitored)
3. **In-app:** "Report bug" / "Contact support" buttons

### SLA
- **Critical (trading halted):** 1hr response, 4hr fix
- **High (feature broken):** 4hr response, 24hr fix
- **Medium (cosmetic/UI):** 24hr response, 1-week fix
- **Low (feature request):** 1-week response, roadmap consideration

### Escalation Path
1. Auto-reply with ticket number
2. Beta user -> Priority queue
3. Critical -> Direct to engineering lead
4. Trading halted -> Immediate alert to on-call

---

## Key Implementation Files

| File | Purpose |
|------|---------|
| `src/platform/billing/onboarding-service.ts` | Signup + verification logic |
| `src/platform/notifications/email-service.ts` | SendGrid email delivery |
| `src/desk/jobs/welcome-email-drip.ts` | Welcome email sequence |
| `src/platform/billing/pricing-tiers.ts` | Tier definitions + limits |
| `src/platform/billing/nowpayments-service.ts` | Payment processing |
| `src/platform/risk/risk-engine.ts` | Risk management (live trading gate) |

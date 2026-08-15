# Beta Pilot Guide

> Onboard first 5-10 beta users. Collect feedback, validate pricing, prove retention.

**Target:** 5-10 paying beta users within 30 days
**Success criteria:** 70% retention at day 30, 3+ feature requests logged, 1+ case study

---

## Beta User Profile

| Attribute | Ideal | Acceptable |
|-----------|-------|-----------|
| Trading experience | 1+ year | Intermediate (6mo+) |
| Capital at risk | $10k-$100k | $5k+ |
| Tech comfort | CLI/crypto native | Willing to learn |
| Feedback willingness | Active communicator | Responds to surveys |
| Use case | Polymarket + crypto | Cross-exchange |

**Target sources:** Trading Discord communities, Polymarket power users, crypto Twitter, indie algo-trader forums

---

## Features to Highlight

### Primary (Demo First)
1. **52+ Strategies** — RSI, MACD, Bollinger, arbitrage variants. Show strategy marketplace.
2. **AI Co-pilot** — Natural language trading queries. "What's my P&L on ETH this week?"
3. **Paper Trading** — Risk-free testing. Live dashboard with leaderboard.

### Secondary (Differentiation)
4. **Risk Management** — VaR, drawdown protection, Kelly sizing. "Your portfolio is protected."
5. **Strategy Marketplace** — Publish, subscribe, monetize. Revenue sharing.
6. **Multi-Exchange** — Binance, OKX, Bybit, Polymarket CLOB via CCXT.

### Tertiary (Stickiness)
7. **Real-time Dashboard** — WebSocket live data, P&L tracking, leaderboard
8. **Telegram Bot** — /ask co-pilot from mobile
9. **Autonomous Trading** — Set it and forget it (with risk gates)

---

## Pricing Tiers

| Tier | Price | Strategies | Markets | Best For |
|------|-------|-----------|---------|----------|
| FREE | $0/mo | 3 | Paper only | Evaluation |
| PRO | $99/mo | 15 | All | Serious traders |
| ENTERPRISE | $299/mo | 50 | All + API | Power users |
| MASTER | $999/mo | Unlimited | All + Priority | Institutions |

**Beta discount:** 50% off first month for beta participants (auto-applied via coupon code `BETA50`)

---

## Onboarding Checklist (Per Beta User)

1. **Day 0: Welcome**
   - Send welcome email with quick-start guide
   - Share dashboard URL + login credentials
   - Schedule 15-min onboarding call

2. **Day 1: Setup**
   - Walk through API key setup (Polymarket or exchange)
   - Enable paper trading mode
   - Show co-pilot demo ("Show me BTC prediction")
   - Verify WebSocket connection on dashboard

3. **Day 3: First Strategy**
   - Pick 1-2 strategies from marketplace
   - Run in paper mode for 24h
   - Review P&L on dashboard

4. **Day 7: Check-in**
   - Review paper trading results
   - Discuss risk settings (drawdown limits)
   - Gather initial feedback
   - Address any issues

5. **Day 14: Go Live Discussion**
   - Review 7-day paper performance
   - Discuss switching to live (if comfortable)
   - Enable risk engine for live users
   - Set position sizing limits

6. **Day 30: Retention Check**
   - Monthly feedback survey
   - Feature request collection
   - Pricing discussion (if tier adjustment needed)

---

## Feedback Collection

### Methods
1. **In-app feedback widget** — "Report bug" / "Suggest feature" buttons
2. **Weekly email survey** — 3 questions max (NPS, feature usage, pain points)
3. **Monthly 1:1 call** — 30min deep-dive on experience
4. **Discord channel** — Private #beta-users channel for real-time feedback

### Key Metrics to Track
| Metric | Target | How to Measure |
|--------|--------|---------------|
| DAU/MAU ratio | >30% | Dashboard login tracking |
| Strategies used | 3+ avg | Strategy execution logs |
| Paper-to-live conversion | >50% | License tier upgrades |
| Support tickets/user | <2/mo | Email/helpdesk count |
| NPS score | >50 | Monthly survey |
| Revenue/user | >$99/mo avg | NOWPayments data |

---

## Beta Launch Sequence

### Week 1: Soft Launch (2-3 users)
- Invite from personal network
- White-glove onboarding
- Daily check-ins

### Week 2: Expanded Beta (5-7 users)
- Open to trading community signups
- Automated onboarding (self-serve)
- Weekly check-ins

### Week 3-4: Full Beta (8-10 users)
- Public beta announcement
- Community feedback channels
- Bi-weekly check-ins

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| User loses money | Paper trading default, risk engine enabled, position limits |
| Platform bugs | Error monitoring (Sentry), instant rollback capability |
| Low engagement | Proactive outreach, feature tutorials, community building |
| Pricing resistance | Beta discount, flexible tiers, demonstrate ROI |
| Email delivery issues | SendGrid API key must be configured, test with beta users first |

---

## Beta Exit Criteria

- [ ] 5+ paying beta users
- [ ] 70% retention at day 30
- [ ] 3+ feature requests implemented
- [ ] 1+ case study / testimonial
- [ ] Risk engine validated with live trades
- [ ] Payment flow end-to-end verified
- [ ] Email delivery confirmed working
- [ ] Dashboard WebSocket stable

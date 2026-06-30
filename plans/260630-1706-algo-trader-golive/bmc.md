# Business Model Canvas — algo-trader RaaS

**Date:** 2026-06-30 | **Stage:** PMF→Early Scale

## Value Propositions

- AI-calibrated prediction market signals across 52+ strategies
- Kelly-optimal position sizing — mathematically proven bet sizing
- RaaS (Robot-as-a-Service): subscribe, get signals, trade — no configuration needed
- Dual-model AI: one for market analysis, one for risk calibration
- Tier-gated access: Starter ($49) → Pro ($149) → Elite ($499)

## Customer Segments

| Segment | Profile | JTBD |
|---------|---------|------|
| Retail traders | Polymarket users wanting alpha | "Give me signals I can act on" |
| Semi-pro traders | Active on CEX/DEX, managing portfolio | "Automate my strategy execution" |
| Early adopters | Crypto-native, comfortable with USDT payments | "Try AI trading without building infra" |

## Channels

- **Acquisition:** Polymarket community, crypto Twitter, prediction market discords
- **Onboarding:** Landing page (cashclaw.cc) → NOWPayments checkout → activation modal
- **Delivery:** Dashboard + Telegram Bot (@Sophia_Bbot)
- **Support:** Telegram bot commands, email

## Revenue Streams

| Tier | Price | Margin |
|------|-------|--------|
| Starter | $49/mo | ~85% (AI inference is primary COGS) |
| Pro | $149/mo | ~85% |
| Elite | $499/mo | ~85% |

- Payment: NOWPayments USDT (crypto-native, low fees)
- Coupon system for promotional discounts

## Cost Structure

| Cost | Type | Est. Monthly |
|------|------|-------------|
| AI inference (OpenRouter) | Variable | $200-500 |
| Cloudflare Workers | Fixed | $5-25 |
| D1 Database | Fixed | $5 |
| NOWPayments fees | Variable | 0.5% per txn |
| Domain + infra | Fixed | $20 |

## Key Resources

- **Tech:** TypeScript monorepo (423 source files), 52+ trading strategies
- **Data:** Polymarket API, CEX/DEX price feeds
- **AI:** Dual-model architecture (OpenRouter API)
- **Infra:** Cloudflare Workers + D1 + Docker VPS
- **Team:** Solo developer (billwill)

## Key Activities

- Signal generation & calibration (automated, cron-driven)
- Strategy development & backtesting
- Customer onboarding & support
- Payment processing & tier management
- Platform uptime & monitoring

## Key Partnerships

- **OpenRouter** — AI model access (GPT-4, Claude)
- **NOWPayments** — USDT payment processing
- **Cloudflare** — Edge infrastructure
- **Polymarket** — Prediction market data

## Customer Relationships

- **Self-serve onboarding:** Landing page → pay → activate → dashboard
- **Automated delivery:** Signals via dashboard + Telegram bot
- **Community-optional:** Discord for strategy discussion
- **Low-touch support:** Bot commands, email support for Elite tier

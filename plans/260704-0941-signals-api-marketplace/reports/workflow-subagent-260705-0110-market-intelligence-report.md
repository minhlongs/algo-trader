# Market Intelligence Report: Prediction Market & Algo Trading API Signal Space

**Date:** 2026-07-05
**Context:** Signals API Marketplace product scoping

---

## 1. Polymarket & Prediction Market Landscape

### Growth Trajectory

| Metric | 2025 | Q1-Q2 2026 | Growth |
|--------|------|------------|--------|
| Polymarket monthly volume | ~$1.2B | $10.6B-$25.7B/mo | 17-20x |
| Polymarket annual volume | $21.5B | ~$240B (projected 2026) | ~11x |
| Polymarket active wallets | Baseline | 3x+ increase (6 months) | 3x+ |
| Kalshi annualized volume | $52B | $178B | 3.4x |
| Global prediction market industry | $51B (2025 total) | ~$240B (2026 projected) | ~370% |

### Key Platform Comparison (2026)

| Dimension | Polymarket | Kalshi |
|-----------|------------|--------|
| Type | Decentralized (Polygon, USDC) | CFTC-regulated (USD) |
| Monthly volume (May 2026) | $10.6B-$25.7B | $18B |
| MAU | N/A (no KYC for basic) | ~2M |
| Valuation | $9B-$15B | $22B |
| Fee model (taker) | Dynamic: 0.75%-1.80% by category | Formula-based, rarely >2% of max profit |
| Maker incentives | Zero fees + USDC rebates | 0.20% maker rebate |
| API | REST + WebSocket + CLOB | REST + WebSocket + FIX 4.4 |
| US access | Geo-blocked | Open (KYC) |
| Best liquidity | Global politics, crypto | Macro, Fed, CPI, weather |

### Signal Accuracy (Academic Study, Jan 2026)

- PredictIt: 93% (position caps prevented whale distortion)
- Kalshi: 78%
- Polymarket: 67%

Key finding: Larger volume does NOT equal better signal quality. Polymarket's deep liquidity attracts concentrated bets that create noise.

### Unified Multi-Venue API Providers

- SimpleFunctions: Free beta, CLI with 42 commands, covers Kalshi + Polymarket
- Tatum: 38 unified endpoints, one API key
- Dome: From ex-Alchemy founders, real-time streaming
- Octagon: Cross-platform edge detection and research

---

## 2. Trading Signal API Market Size

### Market Estimates

| Market Segment | 2025 Size | 2032 Forecast | CAGR |
|----------------|-----------|---------------|------|
| Stock Market API (signal-adjacent) | $1.46B | $2.09B | 5.3% |
| Algorithmic Trading (narrow scope) | $3.25B | $5.88B (2033) | 7.7% |
| Algorithmic Trading (broad scope) | $15.24B | $33.09B | 11.7% |
| AI Trading Agents | $7.63B | $182.97B (2033) | 49.6% |
| Crypto Trading Bots | $54.08B (2026) | $200.14B (2035) | 14% |

### Key Trend

No standalone "Trading Signal API" market exists as a tracked segment. The signal delivery function overlaps stock market APIs, algo trading platforms, and AI agent markets. The AI-driven subsegment (49.6% CAGR) is where the fastest growth is occurring, driven by demand for ML-generated signals consumed programmatically.

---

## 3. Competitive Landscape

### Signal Marketplace Platforms

| Platform | Strategy/Signal Marketplace | Creator Commission | Buyer Pricing |
|----------|----------------------------|-------------------|---------------|
| **TradingView** | Paid Spaces (invite-only scripts) | 85% creator (15% TV fee) | $12.95-$199.95/mo platform + script sub |
| **TakeProfit** | Open creator marketplace | 80-100% creator | $20/mo (all features) |
| **Cryptohopper** | 1,000+ strategies | $1.99-$99/mo per strategy | $24-$108/mo platform |
| **3Commas** | Signal marketplace | Included in higher tiers | $20-$140/mo platform |
| **QuantConnect Alpha Streams** | Defunct (Feb 2022) | N/A | N/A |

### Signal API Subscription Benchmarks

| Tier | Price Range | Examples |
|------|------------|----------|
| Indie / Open source | $0-$15/mo | CryptoSignal ($4.99), Lazy Mac ($14.99) |
| Mid-market | $20-$50/mo | altFINS Essential ($40), Synaptic Quant ($20-40) |
| Premium | $89-$197/mo | Trade Ideas Basic ($89/yr), Benzinga Essential ($197) |
| Professional / Institutional | $200-$700/mo | Trade Ideas Premium ($178-254), Whale Alert Enterprise ($699) |
| Pay-per-call | $0.01-$0.25/call | sml-x402 ($0.01/signal) |
| Performance-based | 20-25% of profits | CoinAnalyst, AlgosOne |

### Key Competitors: Signal-as-a-Service

| Provider | Focus | Pricing | Differentiator |
|----------|-------|---------|----------------|
| altFINS | Crypto chart patterns | $20-40/mo | API + MCP server launched Mar 2026 |
| Trade Ideas | US equities AI signals | $89-254/mo | Holly AI, 50+ strategies |
| Benzinga Pro | News-based signals | $37-197/mo | Real-time news + squawk |
| Whale Alert | Blockchain whale tx | $30-699/mo | 13 blockchains, 100+ assets |
| FinSignals | Sentiment analysis | Free-$29/mo | Reddit/meme stock sentiment (Mar 2026) |
| CoinAnalyst | AI quant crypto | 20% of profits | Launched Sep 2025 |

### Polymarket-Specific Trading Bot Landscape (2026)

- Feb 2026 rule changes killed taker arbitrage (delay removed, dynamic fees up to 1.56%)
- New meta: Maker strategies with zero fees + rebates
- "The bots that win in 2026 aren't the fastest takers -- they're the best liquidity providers"
- Technical requirements: WebSocket (not REST), sub-100ms cancel/replace, fee-aware order signing
- Polymarket monthly revenue: ~$25M/month ($300M annualized)

---

## 4. Pricing Benchmarks

### Monthly Subscription Tiers (Signal API / Strategy Marketplace)

| Category | Floor | Median | Ceiling |
|----------|-------|--------|---------|
| Indie/retail signal API | $4.99/mo | $14.99/mo | $29/mo |
| Mid-tier AI signal service | $20/mo | $40/mo | $50/mo |
| Premium equity signals | $89/mo | $127/mo | $254/mo |
| Enterprise API | $300/mo | $500/mo | $699/mo |
| Strategy marketplace (per strategy) | $1.99/mo | $19.99/mo | $99/mo |
| Pay-per-call | $0.01/call | $0.05/call | $0.25/call |

### Platform Commission Benchmarks

| Platform | Commission | Notes |
|----------|-----------|-------|
| TradingView Paid Spaces | 15% | Creator keeps 85% |
| TakeProfit | 0-20% | Up to 100% on self-sold |
| Cryptohopper | Platform fee + strategy fee | $24-108/mo + $1.99-99/mo |
| Anny Trade | 10-15% | Payment processing on signal groups |
| sml-x402 | 30% affiliate revshare | USDC on Base |

### What Users Pay for Prediction Market API Access

| Service | Cost | What You Get |
|---------|------|-------------|
| Polymarket CLOB API | Free (gas costs for trades) | Full order book, trade execution |
| Kalshi API | Free | Public market data, trade execution |
| SimpleFunctions | Free beta | Unified Kalshi + Polymarket CLI |
| Tatum | Pay-as-you-go | 38 endpoints, one key |
| Dome | TBD | Real-time streaming, multi-SDK |

---

## 5. Strategic Observations

1. **Massive TAM tailwind**: Prediction markets grew ~20x in 18 months. The $1T-by-2030 projection (Bernstein) means the addressable market for signal APIs serving this space will grow 4-5x in 4 years.

2. **Price discovery gap**: Polymarket's 67% accuracy vs PredictIt's 93% creates a real product opportunity for a signal service that cross-references multiple venues and applies quality filters -- the raw feed is noisy.

3. **Unified APIs are early**: SimpleFunctions, Tatum, and Dome are all pre-revenue / early-stage. No clear winner has emerged for cross-platform prediction market data.

4. **Sub-$15/mo is the indie "sweet spot"**: CryptoSignal ($4.99), Lazy Mac ($14.99), and FinSignals ($29) show that developer-friendly signal APIs with focused scope can command modest but real revenue without enterprise sales.

5. **AI agent consumption is growing**: Several providers (altFINS, Lazy Mac, Upstox) have launched MCP endpoints and Claude skills in 2026 specifically for AI agent consumption of trading signals.

6. **Polymarket bot market is underserved**: The Feb 2026 rule changes created a new demand for maker-optimized strategies and infrastructure. Existing tooling (py-clob-client, polymarket-rs) is raw -- no polished "signals + execution" product exists.

Status: DONE
Summary: Comprehensive market intelligence gathered across prediction market growth, trading signal API market sizing, competitive landscape analysis, and pricing benchmarks.

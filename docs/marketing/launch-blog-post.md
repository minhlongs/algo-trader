# Blog Post: Introducing AI Co-pilot -- Your Natural Language Trading Assistant

> **Published:** July 4, 2026
> **Author:** Solo Founder, Algo Trader
> **Reading time:** 8 min

---

## What Is It?

The AI Co-pilot is a natural language interface to your trading desk. Type a question, get an answer with live data from your strategies, risk models, and market feeds.

No dashboards to navigate. No SQL queries to write. No CLI commands to remember.

**Just ask:**

- "What is my risk exposure?"
- "Find arbitrage opportunities"
- "How are my strategies performing?"
- "What is the market doing right now?"
- "Generate a weekly report"

---

## How It Works

The Co-pilot processes every query through a 3-step pipeline:

### Step 1: Intent Classification

Your question is classified into one of 5 supported intents using keyword pattern matching with confidence scoring:

| Intent | Example | Confidence Pattern |
|--------|---------|-------------------|
| Risk Assessment | "What's my risk?" | risk, exposure, drawdown, circuit breaker |
| Arb Scan | "Find arb opportunities" | arb, opportunity, mispricing, spread |
| Strategy Performance | "How are my strategies?" | win rate, sharpe, P&L, profit |
| Market Regime | "What's the market doing?" | regime, trending, ranging, bull, bear |
| Weekly Report | "Generate a report" | report, summary, weekly, digest |

If confidence is below 50%, the Co-pilot returns a helpful list of supported questions rather than guessing wrong.

### Step 2: Handler Execution

Each intent has a dedicated handler that gathers live data from existing trading services:

- **Risk Handler:** Kelly position sizer, drawdown monitor, circuit breaker, prediction accuracy
- **Arb Handler:** Spread detector, cross-market arb, Gamma API markets, hedge discovery
- **Performance Handler:** Prediction accuracy tracker, backtest runner, strategy registry
- **Regime Handler:** Regime detector (GRU neural net), signal fusion engine, DNA engine
- **Report Handler:** Aggregates data from all handlers + trade history

All handlers run in parallel with a 5-second timeout per handler.

### Step 3: Response Formatting

The response is formatted as markdown with optional action buttons (e.g., "View Dashboard", "Run Scan"). Telegram responses use clean markdown with proper truncation at 4,000 characters.

---

## 5 Things You Can Ask Right Now

### 1. "What is my risk exposure?"

Returns:
- Risk score (0-10 scale)
- Current drawdown %
- Circuit breaker status
- Largest position and concentration
- Warnings for underperforming strategies

### 2. "Find arbitrage opportunities"

Scans 30+ Polymarket CLOB markets for:
- Price spreads across related markets
- Cross-market arbitrage windows
- Hedge discovery opportunities
- Top 5 opportunities ranked by edge %

### 3. "How are my strategies performing?"

Aggregates:
- Win rate per strategy (with sample size)
- Sharpe ratio (annualized)
- Realized + unrealized P&L
- Strategy rankings by performance

### 4. "What is the market doing right now?"

Reads the regime detector (neural net) for:
- Current market regime (bull/bear/range/volatile)
- Regime confidence score
- Timeframe analysis (5m, 1h, 4h, 1d)
- Summary of current signal fusion output

### 5. "Generate a weekly report"

Combines everything into a comprehensive digest:
- P&L summary (realized + unrealized)
- Win rate and trade count
- Top/bottom performing strategies
- Regime summary for the week
- Actionable recommendations

---

## Technical Architecture

```
User Query (Dashboard or Telegram)
        │
        ▼
  Intent Classifier (keyword + confidence threshold)
        │
        ▼
  Parallel Handlers (5 sec timeout each)
  ┌──────┬──────┬──────┬──────┬──────┐
  │ Risk │ Arb  │ Perf │ Regm │ Rpt  │
  └──────┴──────┴──────┴──────┴──────┘
        │
        ▼
  Response Formatter (markdown + actions)
        │
        ▼
  Dashboard Chat Widget / Telegram Reply
```

**Key design decisions:**
- No free-text LLM chat -- AlphaEar client doesn't support it, so fallback returns structured intent listing
- Local inference only -- runs on M1 Max, no cloud API costs
- Rate limited -- 10 req/min (PRO), 30/min (ENTERPRISE+)
- Auth-gated via Bearer token -- Telegram requests use TELEGRAM_COPILOT_API_KEY

---

## Roadmap

**Next up:**
- [ ] Strategy-specific queries ("How is momentum-v2 doing?")
- [ ] Natural language trade execution ("Close my ETH position")
- [ ] Custom alert triggers via Co-pilot ("Alert me when drawdown exceeds 5%")
- [ ] Voice interface (Telegram voice messages)
- [ ] Multi-user support for family office setups

---

## Get Started

The AI Co-pilot is available now:

- **FREE tier:** Basic scanning, limited signals
- **STARTER ($19/mo):** AI Co-pilot access + strategy marketplace
- **PRO ($99/mo):** Full Co-pilot, Telegram /ask, all 5 intents
- **ENTERPRISE ($499/mo):** Custom strategies, dedicated infrastructure
- **MASTER ($999/mo):** White-label, private marketplace

**No credit card needed for FREE tier.**

Try it: https://quant.cashclaw.cc
Ask your first question today.

---

*Disclaimer: This is not financial advice. Trading involves risk of loss. Past performance does not guarantee future results. AI-generated responses are for informational purposes only and should not be considered trading advice.*

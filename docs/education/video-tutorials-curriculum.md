# Video Tutorials: YouTube Series Curriculum

A structured curriculum for video tutorials covering algo-trader from beginner to advanced topics.

---

## Series Overview

**Target Audience**: Traders, developers, and quant analysts wanting to learn algorithmic trading
**Prerequisites**: Basic programming knowledge (TypeScript/JavaScript), understanding of financial markets
**Duration**: 20-30 episodes, 15-30 minutes each
**Total Watch Time**: ~8-12 hours

---

## Season 1: Foundation (Episodes 1-8)

### Episode 1: What is Algo-Trader? (15 min)

**Topics**:
- Project overview and capabilities
- Architecture at a glance
- Use cases: retail trading, RaaS, hedge funds
- Demo: Live dashboard and trading in action
- Installation prerequisites

**Code Repository**: `examples/season1/episode01-hello-world`
**Key Files**: `README.md`, demo screenshots

---

### Episode 2: Setting Up Your Environment (20 min)

**Topics**:
- Installing Node.js, pnpm, Docker
- Configuring Docker Compose (Postgres, Redis, NATS)
- Cloudflare Workers setup
- Building and running the project
- Troubleshooting common issues

**Hands-On**:
```bash
git clone https://github.com/longtho638-jpg/algo-trader.git
pnpm install
docker-compose up -d
pnpm build
pnpm dev
```

**Code Repository**: `examples/setup-guide`
**Key Files**: `SETUP.md`, `docker-compose.yml`

---

### Episode 3: Hello World Strategy (25 min)

**Topics**:
- Understanding the `IStrategy` interface
- Creating your first strategy class
- Implementing `getName()`, `initialize()`, `execute()`
- Returning signals (buy/sell/wait)
- Building and testing
- Viewing logs

**Project**: Hello World strategy that logs each execution

**Code Repository**: `examples/season1/episode03-hello-world`
**Key Files**:
- `01-hello-world-strategy.ts`
- `test/hello-world.test.ts`

**YouTube Timestamps**:
- 0:00 Introduction
- 3:30 Strategy interface deep-dive
- 8:45 Implementing the class
- 15:00 Building and running
- 20:00 Debugging with logs
- 23:00 Next steps

---

### Episode 4: Reading Price Data (20 min)

**Topics**:
- Understanding OHLCV candles
- Price data structure (`ICandle` interface)
- Historical data access
- Real-time data streams
- Data quality checks (gaps, outliers)

**Project**: Strategy that logs price statistics

**Code Repository**: `examples/season1/episode04-price-data`
**Key Files**:
- `02-price-reader-strategy.ts`
- `utils/data-quality.ts`

---

### Episode 5: Simple Moving Average (SMA) (25 min)

**Topics**:
- What is a moving average?
- Calculating SMA from scratch
- Using SMA for trend identification
- Golden cross and death cross signals
- Complete working strategy

**Project**: SMA crossover strategy (10-period vs 30-period)

**Code Repository**: `examples/season1/episode05-sma-crossover`
**Key Files**:
- `02-sma-crossover-strategy.ts`
- `utils/indicators.ts`

**YouTube Timestamps**:
- 0:00 What are moving averages?
- 5:30 SMA calculation algorithm
- 12:00 Implementing crossover detection
- 18:00 Testing on historical data
- 22:00 Tuning parameters

---

### Episode 6: RSI and Mean Reversion (25 min)

**Topics**:
- RSI concept and formula
- Overbought vs oversold
- Mean reversion trading
- Implementing RSI from scratch
- Combining with SMA for confirmation

**Project**: RSI mean reversion strategy (RSI < 30 = buy, RSI > 70 = sell)

**Code Repository**: `examples/season1/episode06-rsi-strategy`
**Key Files**:
- `03-rsi-mean-reversion-strategy.ts`

---

### Episode 7: Combining Indicators (30 min)

**Topics**:
- Why use multiple indicators?
- Signal voting/confluence systems
- Weighting indicators by confidence
- Avoiding whipsaws
- Building a multi-indicator strategy

**Project**: Strategy combining SMA + RSI + Volume

**Code Repository**: `examples/season1/episode07-multi-indicator`
**Key Files**:
- `04-multi-indicator-confluence-strategy.ts`

---

### Episode 8: Strategy Testing Basics (25 min)

**Topics**:
- Unit testing strategies with Vitest
- Test data generation
- Asserting signal outputs
- Edge case testing
- Code coverage

**Project**: Complete test suite for SMA crossover strategy

**Code Repository**: `examples/season1/episode08-testing`
**Key Files**:
- `test/sma-crossover.test.ts`
- `test/utils/test-data-generator.ts`

**YouTube Timestamps**:
- 0:00 Why test strategies?
- 4:30 Setting up Vitest
- 8:15 Test data generation
- 15:00 Writing assertions
- 20:00 Edge cases and coverage
- 23:00 Running tests in CI

---

## Season 2: Intermediate (Episodes 9-16)

### Episode 9: Risk Management 101 (30 min)

**Topics**:
- Why risk management matters
- Position sizing: fixed % vs Kelly
- Stop-loss types (fixed %, ATR-based, trailing)
- Take-profit strategies
- Maximum drawdown protection

**Project**: Adding risk management to SMA strategy

**Code Repository**: `examples/season2/episode09-risk`
**Key Files**:
- `05-risk-managed-kelly-strategy.ts`
- `utils/risk-calculator.ts`

---

### Episode 10: Kelly Criterion Deep Dive (25 min)

**Topics**:
- The Kelly formula explained
- Fractional Kelly for safety
- Estimating win rate and win/loss ratio
- Volatility adjustment
- Practical implementation

**Project**: Kelly-based position sizing module

**Code Repository**: `examples/season2/episode10-kelly`
**Key Files**:
- `utils/kelly-calculator.ts`
- `test/kelly.test.ts`

---

### Episode 11: Backtesting Fundamentals (30 min)

**Topics**:
- What is backtesting?
- Building a backtest engine
- Trade tracking and P&L calculation
- Performance metrics: Sharpe, Sortino, drawdown
- Common pitfalls (look-ahead bias, survivorship bias)

**Project**: Simple backtest runner for single strategy

**Code Repository**: `examples/season2/episode11-backtesting`
**Key Files**:
- `backtest/runner.ts`
- `backtest/metrics.ts`

---

### Episode 12: Advanced Backtesting (30 min)

**Topics**:
- Slippage modeling
- Commission calculation
- Monte Carlo simulation
- Walk-forward analysis
- Parameter optimization (and overfitting dangers)

**Project**: Production-grade backtest with costs

**Code Repository**: `examples/season2/episode12-advanced-backtest`
**Key Files**:
- `backtest/enhanced-runner.ts`
- `backtest/walkforward.ts`

---

### Episode 13: The Stack: Understanding Architecture (35 min)

**Topics**:
- Full system architecture diagram
- Cloudflare Workers and Durable Objects
- Multi-region scaling
- Strategy sharding
- Order execution pipeline
- Data flow deep-dive

**Visuals**:
- System architecture diagram
- Request flow chart
- Sharding allocation diagram

**Reference**: `docs/system-architecture.md`

---

### Episode 14: API Reference Walkthrough (30 min)

**Topics**:
- Key API endpoints (REST & WebSocket)
- Authentication and rate limiting
- CRUD operations for strategies
- Webhook configuration
- Error handling

**Demo**:
```bash
# List strategies
curl https://api.algo-trader.workers.dev/api/v1/strategies

# Enable strategy
curl -X POST https://api.algo-trader.workers.dev/api/v1/strategy/enable \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "sma-crossover"}'

# Get performance metrics
curl https://api.algo-trader.workers.dev/api/v1/metrics/performance
```

**Reference**: `docs/api-reference.md`

---

### Episode 15: Paper Trading (20 min)

**Topics**:
- What is paper trading?
- Setting up paper trading mode
- Comparing results to backtests
- Identifying data quality issues
- Psychology of trading vs backtesting

**Project**: 2-week paper trading experiment

**Checklist**:
- [ ] Configure paper trading mode
- [ ] Run for minimum 2 weeks
- [ ] Compare actual vs backtest returns
- [ ] Document discrepancies
- [ ] Adjust strategy if needed

---

### Episode 16: Deploying to Production (25 min)

**Topics**:
- Production deployment checklist
- Cloudflare Workers deployment
- Environment configuration
- Monitoring setup
- Rollback procedures

**Hands-On**:
```bash
# Build worker
pnpm build:worker

# Deploy to staging
wrangler deploy --env staging

# Verify
curl https://staging.algo-trader.workers.dev/api/health

# Deploy to production
wrangler deploy --env production
```

**Reference**: `docs/deployment-guide.md`

---

## Season 3: Advanced (Episodes 17-24)

### Episode 17: Advanced Indicators (30 min)

**Topics**:
- Bollinger Bands and squeeze detection
- MACD histogram divergences
- VWAP for intraday trading
- ATR for dynamic stops
- Multi-timeframe analysis

**Project**: Multi-indicator strategy with 5+ signals

**Code Repository**: `examples/season3/episode17-advanced-indicators`

---

### Episode 18: Machine Learning Strategies (35 min)

**Topics**:
- Integrating ML models (TensorFlow.js)
- Feature engineering for price prediction
- Model training and inference
- Model deployment to Workers
- Performance monitoring

**Project**: LSTM price predictor integrated with rule-based signals

**Reference**: `src/ml/`, `intelligence/`

---

### Episode 19: Market Making Strategy (30 min)

**Topics**:
- What is market making?
- Bid-ask spread capture
- Inventory management
- Adverse selection risk
- Implementing a simple market maker

**Project**: Market making strategy for Polymarket

**Code Repository**: `examples/season3/episode19-market-making`

---

### Episode 20: Arbitrage Strategies (30 min)

**Topics**:
- Cross-exchange arbitrage
- Statistical arbitrage (pairs trading)
- Triangular arbitrage
- Execution speed requirements
- Risk management for arbitrage

**Project**: Cross-exchange price disparity detector

**Reference**: `src/arbitrage/`

---

### Episode 21: Multi-Strategy Portfolios (30 min)

**Topics**:
- Strategy correlation
- Portfolio optimization
- Capital allocation (Kelly, risk parity)
- Rebalancing frequency
- Performance attribution

**Project**: Portfolio manager allocating across 3 strategies

**Code Repository**: `examples/season3/episode21-portfolio`

---

### Episode 22: Advanced Risk: VaR and CVaR (25 min)

**Topics**:
- Value at Risk (VaR) calculation methods
- Conditional Value at Risk (CVaR)
- Historical vs Monte Carlo VaR
- Stress testing
- Position limits based on VaR

**Project**: VaR calculator for portfolio

**Reference**: `src/risk/var-calculator.ts`

---

### Episode 23: Performance Optimization (30 min)

**Topics**:
- Profiling strategy execution
- Memory optimization
- Indicator calculation caching
- Batch processing
- Reducing garbage collection

**Before/After**:
- Memory: 50MB → 15MB
- Execution time: 50ms → 10ms
- GC pressure: High → Low

**Tools**:
- Chrome DevTools profiler
- Node.js heap snapshots
- Custom performance timers

---

### Episode 24: Production Operations (35 min)

**Topics**:
- Incident response playbook
- Alerting and pager setup
- Capacity planning
- Disaster recovery
- Post-mortem analysis

**Simulation**: Simulate strategy failure and walk through recovery

**Reference**: `docs/runbooks/`, `docs/disaster-recovery-playbook.md`

---

## Season 4: Expert & Ecosystem (Episodes 25-30)

### Episode 25: Building Custom Indicators (30 min)

**Topics**:
- Designing custom indicators
- Regime detection (trending vs mean-reverting)
- Market microstructure features
- Signal fusion algorithms
- Machine-readable indicator outputs

**Project**: Custom "momentum divergence" indicator

---

### Episode 26: Reinforcement Learning (35 min)

**Topics**:
- RL basics for trading
- State space design
- Action space (discrete vs continuous)
- Reward function design
- Training and evaluation

**Project**: DQN agent for position management

**Reference**: `rl/`, `intelligence/`

---

### Episode 27: Multi-Exchange Integration (30 min)

**Topics**:
- Exchange abstraction layer
- Polymarket CLOB integration
- Binance/Kraken/Kucoin adapters
- Order routing and execution
- Exchange-specific quirks

**Project**: Adding Binance futures support

**Reference**: `src/exchanges/`, `src/polymarket/`

---

### Episode 28: Advanced Order Types (25 min)

**Topics**:
- Limit, market, stop-loss, take-profit
- OCO (One-Cancels-Other)
- Trailing stops
- Iceberg orders
- TWAP/VWAP execution

**Project**: Advanced order executor with all order types

---

### Episode 29: Compliance & Reporting (20 min)

**Topics**:
- Trade reporting requirements
- Audit trails
- Tax reporting
- P&L attribution
- Regulatory considerations (SEC, CFTC)

**Project**: Export trades to CSV/JSON for tax software

---

### Episode 30: Building a Trading Bot Business (30 min)

**Topics**:
- Monetizing strategies (RaaS model)
- Multi-tenancy and isolation
- Billing and usage tracking
- Customer success
- Open source contribution

**Reference**: `docs/RAAS_API_ENDPOINTS.md`, `docs/license-management.md`

---

## Video Production Guidelines

### Format

- **Resolution**: 1080p minimum, 4K preferred
- **Audio**: Clear narration, minimal background noise
- **Length**: 15-30 minutes (modular)
- **Style**: Screen recording + voiceover + occasional B-roll
- **Editing**: Remove dead air, add chapter markers

### Script Structure

```markdown
[Intro: 0:00-2:00]
- What we'll build
- Why it matters
- Prerequisites check

[Main Content: 2:00-25:00]
- Step-by-step implementation
- Explain concepts as you code
- Show both success and failure cases

[Summary: 25:00-28:00]
- Key takeaways
- Common pitfalls
- Next steps

[Outro: 28:00-30:00]
- Links to code
- Related videos
- Call to action (subscribe, comment, star repo)
```

### Code Repository Structure

```
examples/
├── season1/
│   ├── episode01-hello-world/
│   │   ├── README.md
│   │   ├── src/
│   │   │   └── strategies/
│   │   │       └── hello-world-strategy.ts
│   │   └── test/
│   │       └── hello-world.test.ts
│   ├── episode02-setup/
│   └── ...
├── season2/
├── season3/
└── season4/
```

Each episode includes:
- **README.md**: Episode summary, learning objectives, resources
- **src/**: Complete working code
- **test/**: Test suite
- **screenshots/**: Before/after screenshots (if applicable)
- **notes.md**: Additional explanations beyond video

---

## Release Schedule

- **Season 1**: Episodes 1-8 (first 2 months)
- **Season 2**: Episodes 9-16 (months 3-4)
- **Season 3**: Episodes 17-24 (months 5-6)
- **Season 4**: Episodes 25-30 (months 7-8)

**Frequency**: 2 episodes per month (bi-weekly)

---

## Supporting Materials

### Blog Posts

For each episode, create accompanying blog post:
- Written tutorial (for those who prefer reading)
- Code snippets and explanations
- FAQ section
- Community comments

### Community

- **Discord/Slack**: #video-tutorials channel for questions
- **GitHub Discussions**: Episode-specific threads
- **Office Hours**: Monthly live Q&A for subscribers

---

## Promotion Strategy

1. **Teaser Clips**: 60-second previews on TikTok/YouTube Shorts
2. **Transcripts**: Full transcripts for SEO
3. **Code Snippets**: Shareable code blocks on Twitter/Dev.to
4. **Community Cross-Promotion**: With trading education channels
5. **Guest Appearances**: Invite other quant traders for interviews

---

## Success Metrics

- **Views**: Target 10K views per episode (Year 1), 100K (Year 2)
- **Engagement**: Comments, likes, shares
- **GitHub Stars**: Increase from video exposure
- **Community Growth**: Discord members, newsletter subscribers
- **User Onboarding**: Reduction in "how do I start?" questions

---

## References

- **Strategy Examples**: `src/strategies/examples/`
- **API Documentation**: `docs/api-reference.md`
- **System Architecture**: `docs/system-architecture.md`
- **Code Snippets**: `docs/code-snippets/`
- **Developer Guide**: `docs/developer-onboarding.md`

---

**Production Notes**:
- Record in batches (2-3 episodes per session)
- Edit each episode within 1 week of recording
- Publish consistently (same day each month)
- Engage with comments within 24 hours
- Iterate based on feedback

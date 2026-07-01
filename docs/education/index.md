# Education & Learning Hub

Welcome to the algo-trader education hub. This is your starting point for learning algorithmic trading with our platform.

---

## Getting Started

### New to algo-trader?

Start here in this order:

1. **[Strategy Development Guide](./strategy-development-guide.md)**
   - Complete tutorial from "Hello World" to production
   - 10 modules covering everything you need
   - Hands-on examples with working code

2. **[Setup Instructions](../../SETUP.md)**
   - Install and configure your environment
   - Prerequisites and dependencies
   - Verify your setup

3. **[Developer Onboarding](../../docs/developer-onboarding.md)**
   - Architecture overview
   - Common development tasks
   - Testing and debugging

---

## Learning Paths

### For Strategy Developers

**Goal**: Build and deploy your own trading strategies

**Path**:
1. Strategy Development Guide (all 10 modules)
2. Code Snippets: [Technical Indicators](../code-snippets/technical-indicators.md)
3. Code Snippets: [Risk Management](../code-snippets/risk-management.md)
4. Code Snippets: [Backtesting](../code-snippets/backtesting.md)
5. Study: [Production Strategies](../../src/strategies/polymarket/)
6. Paper trade for 2-4 weeks
7. Deploy to production

**Estimated Time**: 40-60 hours of active learning + 2-4 weeks paper trading

---

### For System Integrators

**Goal**: Integrate algo-trader with your infrastructure

**Path**:
1. [System Architecture](../../docs/system-architecture.md)
2. [API Reference](../../docs/api-reference.md)
3. [Deployment Guide](../../docs/deployment-guide.md)
4. [Multi-Region Deployment](../../docs/deployment-multi-region.md)
5. [Metrics Reference](../../docs/metrics-reference.md)
6. [Runbooks](../../docs/runbooks/)

**Estimated Time**: 20-30 hours

---

### For Quantitative Researchers

**Goal**: Develop advanced ML/RL strategies

**Path**:
1. Strategy Development Guide (Modules 1-7)
2. Study: [`src/intelligence/`](../../src/intelligence/)
3. Study: [`src/rl/`](../../src/rl/)
4. Study: Production ML strategies (Kronos, etc.)
5. [News Sentiment System](../../docs/) (if implemented)
6. [Social Media Analysis](../../docs/) (if implemented)

**Estimated Time**: 60-100 hours

---

## Sample Strategies

### Educational Examples

These are simplified, well-documented strategies for learning:

| Strategy | Complexity | Concepts Covered | File |
|----------|------------|------------------|------|
| Hello World | Beginner | Interface, basic structure | `01-hello-world-strategy.ts` |
| SMA Crossover | Beginner | Moving averages, crossovers | `02-sma-crossover-strategy.ts` |
| RSI Mean Reversion | Intermediate | RSI, mean reversion, thresholds | `03-rsi-mean-reversion-strategy.ts` |
| Multi-Indicator Confluence | Intermediate | Signal combination, voting | `04-multi-indicator-confluence-strategy.ts` |
| Risk-Managed Kelly | Advanced | Kelly criterion, position sizing, stops | `05-risk-managed-kelly-strategy.ts` |

**Location**: `src/strategies/examples/`

---

### Production Strategies

40+ production-ready strategies in `src/strategies/polymarket/`:

**Categories**:
- **Momentum**: `momentum-cascade.ts`, `price-acceleration.ts`
- **Mean Reversion**: `gap-fill-reversion.ts`, `spread-mean-reversion.ts`
- **Arbitrage**: `delta-neutral-volatility-arbitrage.ts`, `cross-event-drift.ts`
- **Volatility**: `volatility-targeting.ts`, `bollinger-squeeze.ts`
- **Market Making**: `orderbook-depth-ratio.ts`, `stale-quote-sniper.ts`
- **Event-Driven**: `event-deadline-scalper.ts`, `resolution-frontrunner.ts`
- **Regime-Adaptive**: `regime-adaptive-momentum.ts`, `regime-switch-detector.ts`

Study these to see production-quality implementations.

---

## Code Snippets

Reusable code for common tasks:

### Technical Indicators
- [SMA, EMA, RSI, Bollinger Bands, ATR, MACD, VWAP](../code-snippets/technical-indicators.md)
- Complete implementations with explanations
- Performance tips and testing patterns

### Risk Management
- [Position sizing, stop-loss, take-profit](../code-snippets/risk-management.md)
- Kelly Criterion
- Drawdown protection
- Daily loss limits
- Volatility adjustment

### Backtesting
- [Backtest loop, metrics, trade tracking](../code-snippets/backtesting.md)
- Walk-forward analysis
- Monte Carlo simulation
- Slippage modeling
- Common pitfalls (look-ahead bias, overfitting)

---

## Video Tutorials

YouTube series curriculum (in development):

### Season 1: Foundation (Episodes 1-8)
- Episode 1: What is algo-trader? (15 min)
- Episode 2: Setting Up Your Environment (20 min)
- Episode 3: Hello World Strategy (25 min)
- Episode 4: Reading Price Data (20 min)
- Episode 5: Simple Moving Average (25 min)
- Episode 6: RSI and Mean Reversion (25 min)
- Episode 7: Combining Indicators (30 min)
- Episode 8: Strategy Testing Basics (25 min)

**Full Curriculum**: [Video Tutorials Curriculum](./video-tutorials-curriculum.md)

---

## API Reference

### Core Modules

| Module | Description | Examples |
|--------|-------------|----------|
| [RiskManager](../../docs/api-reference.md#riskmanager) | Position sizing, stops, metrics | Position sizing, trailing stops |
| [BacktestRunner](../../docs/api-reference.md#backtestrunner) | Backtesting engine | Complete backtest workflows |
| [VaRCalculator](../../docs/api-reference.md#var-calculator) | Value at Risk | Portfolio risk assessment |
| [CorrelationCalculator](../../docs/api-reference.md#correlationcalculator) | Asset correlations | Portfolio diversification |
| [WalkForwardAnalyzer](../../docs/api-reference.md#walkforwardanalyzer) | Rolling validation | Parameter stability testing |
| [MonteCarloSimulator](../../docs/api-reference.md#montecarlosimulator) | Robustness testing | Strategy robustness |

**Enhanced Examples**: See `docs/api-reference.md` for complete examples with real code.

---

## Common Tasks

### How to Add a New Strategy

1. Create file in `src/strategies/examples/` or `src/strategies/polymarket/`
2. Implement `IStrategy` interface
3. Export class with descriptive name
4. Register in `src/strategies/loader.ts`
5. Write unit tests
6. Build: `pnpm build`
7. Test: `pnpm test`
8. Paper trade
9. Deploy

**Example**: See any strategy in `src/strategies/examples/`

---

### How to Test a Strategy

```bash
# Unit tests
pnpm test --grep "MyStrategy"

# Integration tests
pnpm test --grep "backtest"

# With coverage
pnpm test:coverage

# E2E tests
pnpm test:e2e
```

**Test Data**: Use `test/utils/test-data-generator.ts` to create synthetic candles.

---

### How to Backtest

```typescript
import { BacktestRunner } from 'src/execution/backtest-runner.js';
import { MyStrategy } from 'src/strategies/examples/my-strategy.js';

const runner = new BacktestRunner({
  strategy: new MyStrategy(),
  initialBalance: 10000,
  dataProvider: csvProvider,
});

const result = await runner.run(30); // 30 days
console.log(result.metrics);
```

---

### How to Deploy to Production

1. **Prerequisites**: All tests passing, paper trading successful
2. **Build**: `pnpm build:worker`
3. **Deploy staging**: `wrangler deploy --env staging`
4. **Verify**: Check health endpoint, logs, metrics
5. **Enable strategy**: POST to `/api/v1/strategy/enable`
6. **Monitor**: Watch Grafana dashboards
7. **Deploy production**: `wrangler deploy --env production`

**Checklist**: See Module 10 in Strategy Development Guide

---

## Resources

### Documentation

| Document | Purpose |
|----------|---------|
| [Project Overview PDR](../../docs/project-overview-pdr.md) | High-level project description |
| [System Architecture](../../docs/system-architecture.md) | Deep architecture dive |
| [Code Standards](../../docs/code-standards.md) | Coding conventions |
| [Developer Onboarding](../../docs/developer-onboarding.md) | Quick start for developers |
| [Deployment Guide](../../docs/deployment-guide.md) | Production deployment |
| [Metrics Reference](../../docs/metrics-reference.md) | All metrics explained |

---

### External References

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Technical Analysis](https://www.investopedia.com/terms/t/technicalanalysis.asp)

---

## Community

### Getting Help

- **Documentation Issues**: Open GitHub issue in `docs/`
- **Code Questions**: GitHub Discussions
- **Discord**: `#algo-trader-dev` (if available)
- **Runbooks**: Check `docs/runbooks/` for incident procedures

### Contributing

We welcome contributions:
- Add more example strategies
- Improve documentation
- Add test cases
- Report bugs
- Share your learning experiences

**See**: `CONTRIBUTING.md` (if exists) or open PR with changes.

---

## Quick Reference

### Essential Commands

```bash
# Development
pnpm install          # Install dependencies
pnpm build           # Build TypeScript
pnpm dev             # Start development server
pnpm test            # Run tests
pnpm lint            # Lint code

# Production
pnpm build:worker    # Build worker
wrangler deploy      # Deploy to Cloudflare

# Docker
docker-compose up -d # Start infra (Postgres, Redis, NATS)
docker-compose ps    # Check status
docker-compose logs  # View logs

# Monitoring
wrangler tail        # View worker logs
curl localhost:3000/metrics  # Prometheus metrics
```

---

## Next Steps

1. **Complete** the Strategy Development Guide (all 10 modules)
2. **Build** a simple strategy following the examples
3. **Test** it thoroughly with backtesting
4. **Paper trade** for at least 2 weeks
5. **Deploy** to staging, verify, then production
6. **Monitor** continuously and iterate

---

**Ready to start?** Begin with [Module 1: Hello World](./strategy-development-guide.md#module-1-hello-world)

**Questions?** Check the [FAQ](#) or open a GitHub discussion.

---

**Happy Trading!** 📈

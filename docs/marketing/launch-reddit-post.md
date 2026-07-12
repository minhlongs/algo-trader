# Launch Reddit Post — r/algotrading

**Title:** I built a solo quant desk with an AI Co-pilot -- 2,855 tests, 52 strategies, $0 employees

**Body:**

r/algotrading,

After 18 months of building alone, my trading platform is launching something I didn't think was possible for a solo founder: a natural language AI trading assistant.

**The problem:** I had 52 strategies running across Polymarket, CEX, and DEX markets. Monitoring risk, checking performance, scanning for arb opportunities -- all meant digging through dashboards, running CLI commands, or writing SQL. Every question cost 5-15 minutes of context switching.

**The solution:** I built an AI Co-pilot that connects directly to the trading engine. Now I type a question and get an answer in seconds.

**What the Co-pilot does:**

- **Risk Assessment:** "What is my risk exposure?" -- pulls Kelly position size, drawdown %, circuit breaker state, recent losses
- **Arb Scan:** "Find arbitrage opportunities" -- scans 30+ Polymarket CLOB markets for edge %
- **Strategy Performance:** "How are my strategies doing?" -- Win rate, Sharpe, P&L per strategy
- **Market Regime:** "What is the market doing right now?" -- Current regime, trend strength, signal fusion
- **Weekly Report:** "Generate a weekly report" -- comprehensive P&L summary with recommendations

Available in the dashboard chat widget AND via Telegram (/ask command).

**The tech stack:**
- Node.js + TypeScript, 2,855 tests passing
- 52 strategies: polymarket (30 V2), cex, dex, dna (GRU neural net), dark-edge
- Dual-model AI: Nemotron-3 Nano (fast scanner) + DeepSeek R1 (deep reasoning)
- Works on M1 Max (all local inference, no cloud API costs)

**Pricing (Robot as a Service):**
- FREE: Basic scanning, limited signals
- STARTER: $49/mo -- AI Co-pilot access, strategy marketplace
- PRO: $99/mo -- full Co-pilot, 5 intent handlers, Telegram /ask
- ENTERPRISE: $299/mo -- custom strategies, dedicated infra
- MASTER: $999/mo -- white-label, private marketplace

**Build-in-public note:** You can follow the full journey in the repo. Every strategy, every test, every mistake. This is what happens when one engineer runs at a problem for 18 months with no employees, no funding, and no bullshit.

**Links:**
- Live demo: https://quant.cashclaw.cc
- GitHub: [repo link]

Happy to answer questions about intent classification, local LLM inference on M1 Max, or building a trading platform solo.

Not financial advice. Do your own research.

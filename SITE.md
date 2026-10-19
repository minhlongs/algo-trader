# AlgoTrade — Site Vision & Stitch UI Roadmap

Bilingual (Vietnamese & English) Multi-Tenant Quantitative Engine & Cloud RaaS Control Plane. High-frequency execution terminal, strategy marketplace with 70/30 creator revenue split, zero-knowledge BYOK onboarding, and PayOS (VietQR) + NOWPayments (Crypto USDT) instant billing.

## Stitch Project

- **Project ID (numeric):** `1566829715937419119`
- **Design System:** Obsidian Quantum (`assets/6c3c1d2b4c04449c9f3274b73a5b69ec`)
- **Stitch-Kit MCP URL:** `https://stitch.googleapis.com/mcp`
- **Transport:** HTTP JSON-RPC 2.0 with `X-Goog-Api-Key`

## Sitemap

- [x] `index.html` — Master Cloud RaaS Dashboard (Alias of dashboard.html)
- [x] `dashboard.html` — Master Cloud RaaS Dashboard & MCU Meter
- [x] `quant-terminal.html` — Institutional Quant Cockpit & Execution Terminal (Almgren-Chriss + OFI)
- [x] `marketplace.html` — Strategy Marketplace & Creator Hub (70/30 split)
- [x] `leaderboard.html` — Bilingual Backtest & Alpha Leaderboard
- [x] `billing.html` — Multi-Tenant Billing & SHA-256 Audit Chain Ledger
- [x] `byok-wizard.html` — Zero-Knowledge BYOK Onboarding Wizard
- [x] `mobile-sentry.html` — Mobile Companion & Risk Sentry
- [x] `styleguide.html` — Universal Component Design System & Style Guide
- [x] `telemetry.html` — Cloudflare Shard Telemetry & Real-Time HFT Execution Mesh
- [x] `latency-simulator.html` — Real-Time WebSocket Trade Feed Simulator & Microstructure Latency Analyzer
- [x] `stress-lab.html` — Algorithmic Stress Testing Lab & Extreme Tail-Risk VaR Simulation Cockpit
- [x] `backtest-studio.html` — Walk-Forward & CPCV Backtest Studio
- [x] `order-routing-mesh.html` — Smart Order Routing (SOR) & Liquidity Aggregation Mesh Console
- [x] `regime-kelly-matrix.html` — Multi-Regime Fractional Kelly, SVI Surface & VPIN Toxicity Cockpit
- [x] `hawkes-orderflow-radar.html` — Hawkes Order-Flow Criticality, Avellaneda-Stoikov Reservation & Kyle Lambda Radar
- [x] `limit-order-queue-cockpit.html` — Queue-Reactive LOB, Roll Implied Spread & Hasbrouck Information Share Cockpit
- [x] `avellaneda-lipkin-kyle-back-cockpit.html` — Avellaneda-Lipkin Market Making, Kyle-Back Insider & VPIN Toxicity Cockpit
- [x] `statarb-glosten-milgrom-cockpit.html` — Cointegration Stat-Arb, OU Half-Life & Glosten-Milgrom Sequential Trade Cockpit
- [x] `black-litterman-risk-parity-cockpit.html` — Black-Litterman Posterior & Equal Risk Contribution Cockpit

## Roadmap & Delivered Screens

1. `index.html` / `dashboard.html` — Portfolio metrics ($1,248,500), running bots, MCU quota meter (18,400 / 25,000), kill-switch.
2. `quant-terminal.html` — Order flow imbalance (OFI Delta +0.48), dual orderbook, execution modes [PAPER | SHADOW | LIVE], Almgren-Chriss TWAP/VWAP.
3. `marketplace.html` — Verified quantitative strategies, Monte Carlo fan charts, transparent 70/30 creator split, 1-click rent.
4. `leaderboard.html` — Bilingual public alpha leaderboard with Sharpe (2.85), Sortino, Calmar ratios.
5. `billing.html` — 4 tiers (BASIC $0, PREMIUM $49/mo, ENTERPRISE $199/mo, MASTER $499/mo), VietQR (PayOS) + NOWPayments USDT (TRC20/BEP20), SHA-256 audit ledger.
6. `byok-wizard.html` — 4-step wizard for AES-256-GCM envelope-encrypted exchange API keys at Cloudflare Edge.
7. `mobile-sentry.html` — Mobile phone viewport with giant slide-to-confirm Emergency Kill-Switch and Telegram alert status.
8. `styleguide.html` — Universal component design token catalog, buttons (all states), form controls, and badge pills.
9. `telemetry.html` — Multi-region Cloudflare Durable Objects shard topology (`shard-asia-1`, `shard-us-east`, `shard-eu-west`), Raft consensus quorum, SQLite DO storage & failover simulation.
10. `latency-simulator.html` — Live Level 3 trade tape, microsecond latency histogram KDE (Tokyo TY3, Ashburn DC2, Frankfurt FR2), artificial packet loss & reconnect stress testing.
11. `stress-lab.html` — Historical crisis replay presets (2010 Flash Crash, May 2021, FTX 2022), 99% CVaR/Expected Shortfall (-$84,200), GARCH(1,1) volatility smile, auto-deleveraging circuit breaker.
12. `backtest-studio.html` — Walk-forward efficiency matrix (2021-2026 rolling folds), Marcos López de Prado PBO (4.2%) & Deflated Sharpe (2.91), Python/Cython parameter hyperspace sliders, non-linear slippage impact curve.
13. `order-routing-mesh.html` — Multi-Venue Best Execution Heatmap (Binance, OKX, Bybit, Coinbase Prime, Kraken, Deribit), Dynamic Splitter Algorithm Selector (Almgren-Chriss, VIL, IS, Dark Pool Iceberg), $2.5M Fill Routing Sankey Diagram (98.4% fill rate, -0.42 bps slip), and Pre-Trade Toxicity Sentry (100ms, 1s, 10s mark-out PnL).
14. `regime-kelly-matrix.html` — Multi-Regime Fractional Kelly Allocation Matrix (Thorp 2006), Gatheral (2006) SVI Volatility Smile & Durrleman No-Arbitrage Monitor, Andersen-Bollerslev (1998) Intraday Diurnal U-Shape Seasonality, and Easley-López de Prado (2012) VPIN Flow Toxicity CDF.
15. `hawkes-orderflow-radar.html` — Hawkes Mutually-Exciting Order-Flow Criticality ($n^*$), Avellaneda-Stoikov (2008) Inventory Reservation Price & Quote Skew, Glosten-Milgrom (1985) Sequential Trade Bayesian Belief, and Kyle (1985) Continuous Auction Lambda Radar.
16. `limit-order-queue-cockpit.html` — Queue-Reactive LOB Imbalance, Roll (1984) Implied Effective Spread, Hasbrouck (1995) Venue Information Share, and Huang-Stoll (1997) Three-Way Spread Decomposition Cockpit.
17. `avellaneda-lipkin-kyle-back-cockpit.html` — Avellaneda-Lipkin (2018) Optimal Market-Making Quote Ladder, Kyle-Back (1992) Insider Lambda & Information Share, and Easley-López de Prado (2012) VPIN Flow Toxicity Buckets.
18. `statarb-glosten-milgrom-cockpit.html` — Engle-Granger (1987) Cointegration ADF Pair Matrix, Ornstein-Uhlenbeck Half-Life & Z-Score State Machine, and Glosten-Milgrom (1985) Sequential Trade Bayesian Belief Updates.
19. `black-litterman-risk-parity-cockpit.html` — Black-Litterman (1992) posterior returns & active tilts, and Equal Risk Contribution (ERC) portfolio weights with marginal risk contributions.

## Creative Freedom

- [x] Cloudflare Durable Objects live shard telemetry map (`shard-asia-1`, `shard-us-east`, `shard-eu-west`).
- [x] Real-time WebSockets trade feed simulator with simulated latency jitter (< 12ms live green pulse).
- [x] Multi-Venue Smart Order Routing (SOR) Mesh Console with Cont-Kukanov (2017) & Laruelle-Lehalle (2013) dark/lit pool allocation.
- [x] Multi-Regime Fractional Kelly & SVI Volatility Surface Cockpit with UI/UX Pro Max (`Cmd+K` 19-Screen Command Palette with live search filter, Bilingual EN/VI Switcher & 3-Theme Switcher).
- [x] Hawkes Order-Flow Criticality & Avellaneda-Stoikov Reservation Radar (`hawkes-orderflow-radar.html`).
- [x] Queue-Reactive LOB, Roll Implied Spread & Hasbrouck Information Share Cockpit (`limit-order-queue-cockpit.html`).
- [x] Avellaneda-Lipkin Market Making & Kyle-Back Insider Dynamics Cockpit (`avellaneda-lipkin-kyle-back-cockpit.html`).
- [x] Cointegration Stat-Arb, OU Half-Life & Glosten-Milgrom Sequential Trade Cockpit (`statarb-glosten-milgrom-cockpit.html`).
- [x] Black-Litterman Posterior & Equal Risk Contribution Cockpit (`black-litterman-risk-parity-cockpit.html`).



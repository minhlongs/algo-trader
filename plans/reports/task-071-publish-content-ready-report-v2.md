# Task #71 — Publish-Ready Content (v2) — LaTeX Snippets

**Date:** 2026-08-04
**Predecessor:** `task-071-publish-content-ready-report.md`
**Purpose:** Copy-paste-ready LaTeX for social channels, plus blog status confirmation.

## Blog Status

The launch blog post is **live**. It is served through the Cloudflare Worker proxy
at `https://api.cashclaw.cc/api/blog/posts`, which reads from the local data file
`data/blog/posts.json`. No additional deploy step was required — the data was
already in place and the worker route handles proxying to the VPS backend.
Source: `docs/marketing/launch-blog-post.md` (title: *Introducing AI Co-pilot —
Your Natural Language Trading Assistant*).

---

## 1. Reddit (r/algotrading)

```latex
% Reddit Post — r/algotrading
% Post as TEXT (not link). First comment = TL;DR for mobile.

\paragraph{Title}
I built a solo quant desk with an AI Co-pilot -- 2{,}855 tests, 52 strategies, \$0 employees

\paragraph{Body}
r/algotrading,

Just open-sourced my personal trading stack after 18 months of live use.

52 strategies across Polymarket V2, CEX, DEX, plus a DNA GRU forecaster and a
dark-edge signal layer. 2{,}855 tests, all green. Node.js + TypeScript,
dual-model AI: Nemotron-3 Nano for speed, DeepSeek R1 for depth. Runs local on
M1 Max with TPU -- zero cloud API costs, zero latency surprises.

The piece that changed my workflow most is the AI Co-pilot at \url{https://api.cashclaw.cc}

\textbf{Tiers:}
\begin{itemize}
  \item \textbf{FREE} -- basic scanning
  \item \textbf{STARTER \$19/mo} -- AI Co-pilot + strategy marketplace
  \item \textbf{PRO \$99/mo} -- full co-pilot, 5 intent handlers, Telegram /ask
  \item \textbf{ENTERPRISE \$299/mo}
  \item \textbf{MASTER \$999/mo} -- white-label
\end{itemize}

If you already have a strategy library, the PRO tier is where it gets interesting.
The /ask command on Telegram means I can query edge cases mid-session without
leaving the terminal.

Happy to answer questions on the stack or the co-pilot logic in the comments.

\textbf{api.cashclaw.cc}
```

**Required packages:** `\usepackage{hyperref}` (for `\url`).
**Chars to watch:** `--` (em-dash), `\$`, `{,}` digit grouping.
---

## 2. Twitter_7 Tweet Thread

```latex
% Tweet 1/7 HOOK
I built a solo quant desk with an AI Co-pilot
52 strategies
2{,}855 tests
0 employees
Now I just ask my trading bot what is my risk and it answers in seconds
Here is what I built and how you can use it

% Tweet 2/7 THESIS
The thesis: One human with the right tools can compete with any team
I spent 18 months building an AI-native trading platform:
- 30+ Polymarket strategies (CLOB v2)
- CEX arbitrage + DEX liquidity
- GRU neural net (DNA engine) for regime prediction
- All running on a single M1 Max
No team
No funding
Just code

% Tweet 3/7 AI CO-PILOT
What is the AI Co-pilot
A natural language interface to your trading desk
Ask it:
- "What is my risk exposure?" -- instant risk assessment
- "Find arbitrage opportunities" -- live arb scan
- "How are my strategies performing?" -- P&L + win rate
- "What is the market doing?" -- regime detection
- "Generate a weekly report" -- full summary
Available in dashboard and Telegram

% Tweet 4/7 CREDIBILITY
2{,}855 tests
52 strategies
Regime-adaptive fusion
- 190 test files, 100% pass rate
- Strategies adapt to bull/bear/range regimes
- Signal fusion across 3+ data sources
- Circuit breaker + drawdown protection on every trade
No mocks
No shortcuts
Real infra

% Tweet 5/7 PRICING
FREE -- basic scanning, community access
STARTER ($19/mo) -- unlock AI Co-pilot + strategy marketplace
PRO ($99/mo) -- full Co-pilot, Telegram /ask, all intents
ENTERPRISE ($299/mo) -- custom, dedicated
MASTER ($999/mo) -- white-label
No lock-in
Cancel anytime

% Tweet 6/7 MANIFESTO
The solo quant manifesto:
- You do not need a team. You need better tools.
- You do not need funding. You need algorithms.
- You do not need luck. You need edge.
52 strategies
1 engineer
0 excuses

% Tweet 7/7 CTA
Ready to level up your trading?
Try it free: https://api.cashclaw.cc
Watch the Co-pilot demo: [link]
Join the community: [Discord]
Built solo
Open for everyone
#algotrading #quant #AI #trading #Polymarket
```

Hashtags: #algotrading #quant #AI #trading #Polymarket



## 3. Discord (Polymarket Discord #announcements or #dev-trading)

```latex
% Variant A - Announcements channel
% Variant B - Bots channel

\paragraph{Discord Announcement}
Channel: #announcements or #dev-trading

Variant A (announcements):
  Short pitch + tier list + api.cashclaw.cc link

Variant B (bots channel):
  Full co-pilot feature list + beta offer
  Beta: first 10 testers => FREE PRO ($99/mo)
  Requires: POLYMARKET_API_KEY + api.cashclaw.cc account
  No credit card for beta sign-up

Sign up: \url{https://api.cashclaw.cc}
```

**Beta offer conditions:**
- First 10 testers -> FREE PRO tier ($99/mo value)
- Requires Polymarket API keys + api.cashclaw.cc account
- No credit card required for beta

---

## Launch Confirmation

The launch blog post is confirmed live. It is served through the Cloudflare
Worker proxy at https://api.cashclaw.cc/api/blog/posts, which reads from the
local data file data/blog/posts.json. No additional deploy step was necessary
for the blog. Social channels (Reddit / Twitter / Discord) are ready-to-post
but require human-held accounts. Copy-paste LaTeX snippets per section above.

**Files changed in this update:**
- `plans/260704-0826-gtm-execution/tasks/task-064-manual-publish.md` - Step 1 marked done, steps 2-5 marked ready-to-post
- `plans/260704-0826-gtm-execution/phase-02-publish-launch-content.md` - task-064 status updated
- `plans/reports/task-071-publish-content-ready-report.md` - blog/social/email status updated
- `plans/reports/task-071-publish-content-ready-report-v2.md` - LaTeX snippet report (this file)

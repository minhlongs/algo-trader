# CashClaw GTM Launch Content Pack

> Ready-to-copy-paste content for manual channel distribution.
> English primary + Vietnamese translation for each platform.
> Last updated: 2026-08-14

**Product URLs:**
- Landing: https://cashclaw.cc
- API: https://api.cashclaw.cc
- Status: https://api.cashclaw.cc/health

---

## 1. Reddit -- r/algotrading

**Target audience:** Algorithmic traders, solo quants, prediction market enthusiasts
**Tone:** Technical peer, problem-solution, not salesy
**Format:** Self-post, 350-400 words

---

### ENGLISH VERSION

**Title:** Built a 52-strategy prediction market desk that runs on crypto billing -- here's the architecture

**Body:**

After 18 months building and live-trading on Polymarket V2, I put together a self-hosted platform that combines 52+ AI strategies with Kelly-optimal position sizing. The whole thing runs on a single operator with zero employees.

**What it does:**

- 52+ strategies across prediction markets (Polymarket CLOB), CEX, and DEX
- Kelly position sizer with dual-model risk calibration (GRU neural net for regime detection, dark-edge signal layer for dislocation timing)
- AI Co-pilot: natural language interface -- ask "what's my risk?" or "find arb opportunities" and get live answers
- Strategy marketplace where users publish and subscribe to community strategies
- Telegram bot for mobile monitoring and /ask queries

**Why it exists:**

Most prediction market traders size positions by gut feel. Kelly math is well-understood but nobody applies it because the tooling is too complex. CashClaw bakes Kelly sizing into every signal -- you just pick which strategies to run and set your bankroll.

**Stack:**

Node.js + TypeScript, Fastify 5, React 19 dashboard, Prisma + PostgreSQL, Redis Cluster. Local inference on M1 Max (Nemotron-3 Nano for speed, DeepSeek R1 for depth). 2,855 tests, production Docker stack.

**Pricing:**

- FREE: basic scanning, limited signals
- STARTER ($19/mo): full strategy set + marketplace
- PRO ($99/mo): AI Co-pilot + Telegram /ask + all 5 intent handlers
- ENTERPRISE ($299/mo): custom strategies, dedicated infra
- Crypto billing only (USDT/USDC via NOWPayments)

**Live at:** https://cashclaw.cc
**API health:** https://api.cashclaw.cc/health

Happy to discuss architecture, Kelly sizing logic, or the dark-edge signal layer in the comments.

---

### TIENG VIET (PHIEN BAN TIENG VIET)

**Tieu de:** Xay dung he thong giao dich prediction market 52+ chien luoc -- ket cau ky thuat

Sau 18 thang xay dung va giao dich truc tiep tren Polymarket V2, toi da gop lai mot nen tang tu host ket hop 52+ chien luoc AI voi kich thuoc vi the Kelly toi uu. Toan bo he thong chay boi mot nguoi duy nhat, khong can doi ngu.

**Noi dung:**

- 52+ chien luoc tren prediction market (Polymarket CLOB), CEX va DEX
- Tinh toan vi the Kelly voi mo hinh risk doi mau (GRU neural net phat hien thi truong, dark-edge signal layer phat hien lech gia)
- AI Co-pilot: giao dien ngu nhien -- hoi "risk cua toi the nao?" hay "tim co hoi arb" va nhan cau tra loi truc tiep
- Chua luoc chien luoc (marketplace) cho nguoi dung cong khai va dang ky chien luoc cong dong
- Telegram bot de giam sat va truy van /ask tren di dong

**Tai sao tao ra:**

Hau het trader prediction market chon vi the bang cam quan. Kelly la phuong phap toan hoc da duoc chung minh nhung khong ai su dung vi cong cu qua phuc tap. CashClaw tich hop Kelly sizing vao moi tin hieu -- ban chi can chon chien luoc va dat bankroll.

**Stack ky thuat:**

Node.js + TypeScript, Fastify 5, React 19, Prisma + PostgreSQL, Redis Cluster. Inference cuc bo tren M1 Max (Nemotron-3 Nano cho toc do, DeepSeek R1 cho do sau). 2,855 test, stack Docker san sang production.

**Gia:**

- FREE: quet co ban, tin hieu han che
- STARTER ($19/thang): bo chien luoc day du + marketplace
- PRO ($99/thang): AI Co-pilot + Telegram /ask + 5 intent handler
- ENTERPRISE ($299/thang): chien luoc tuy chinh, infra rieng
- Thanh toan crypto (USDT/USDC qua NOWPayments)

**Truy cap:** https://cashclaw.cc
**API health:** https://api.cashclaw.cc/health

San sang trao doi ve ky thuat, logic Kelly sizing, hoac dark-edge signal layer o phan binh luan.

---

## 2. Twitter/X Thread

**Target audience:** Crypto Twitter, prediction market traders, indie hackers
**Tone:** Punchy, hook-driven, 280 chars per tweet
**Format:** 7-tweet thread

---

### ENGLISH VERSION

**Tweet 1/7 (HOOK):**

52 AI strategies. 1 operator. Zero employees.

Built a prediction market trading desk that runs Kelly-optimal sizing on every signal.

Here's what it does and why it matters:

**Tweet 2/7:**

Prediction markets are booming. Polymarket alone does $1B+ monthly volume.

But most traders lose because they size positions by gut feel. Kelly math exists -- nobody uses it because the tooling is too hard.

**Tweet 3/7:**

CashClaw bakes Kelly sizing into every trade:

- 52+ strategies across Polymarket CLOB, CEX, DEX
- Dual-model risk: GRU neural net for regime detection + dark-edge signal layer
- Every signal arrives pre-sized with optimal position amount

**Tweet 4/7:**

The piece that changed my workflow: an AI Co-pilot.

Ask it "what's my risk?" or "find arb opportunities" -- get live answers from your strategies, risk models, and market feeds. No dashboards. No SQL. No CLI commands.

**Tweet 5/7:**

The strategy marketplace is where it gets interesting.

Users publish strategies. Others subscribe. Community-driven alpha generation without giving up your edge.

**Tweet 6/7:**

Stack: Node.js + TypeScript, Fastify 5, Prisma, Redis Cluster. Local inference on M1 Max. 2,855 tests. Crypto billing only (USDT/USDC).

FREE tier available. No credit card.

**Tweet 7/7 (CTA):**

Try it: https://cashclaw.cc
API health: https://api.cashclaw.cc/health

Pricing: FREE / STARTER $19 / PRO $99 / ENTERPRISE $299 per month.

Questions? Drop them below.

---

### TIENG VIET (PHIEN BAN TIENG VIET)

**Tweet 1/7 (HOOK):**

52 chien luoc AI. 1 nguoi van hanh. 0 nhan vien.

Xay dung ban giao dich prediction market voi Kelly sizing toi uu moi tin hieu.

Day la cach no hoat dong va tai sao quan trong:

**Tweet 2/7:**

Prediction market dang buom. Chi Polymarket da giao dich hon $1B/thang.

Nhung hau het trader thua vi chon vi the bang cam quan. Kelly math da co -- khong ai dung vi cong cu qua phuc tap.

**Tweet 3/7:**

CashClaw tich hop Kelly sizing vao moi lenh:

- 52+ chien luoc tren Polymarket CLOB, CEX, DEX
- Risk doi mau: GRU neural net phat hien thi truong + dark-edge signal layer
- Moi tin hieu gui den voi so luong vi the toi uu san san

**Tweet 4/7:**

Phan thay doi workflow cua toi: AI Co-pilot.

Hoi "risk cua toi the nao?" hay "tim co hoi arb" -- nhan cau tra loi truc tiep tu chien luoc, mo hinh risk va feed thi truong. Khong can dashboard. Khong can SQL. Khong can CLI.

**Tweet 5/7:**

Chua luoc chien luoc (marketplace) la phan hap dan nhat.

Nguoi dung cong khai chien luoc. Nguoi khac dang ky. Tao alpha cong dong ma khong can chia se edge ca nhan.

**Tweet 6/7:**

Stack: Node.js + TypeScript, Fastify 5, Prisma, Redis Cluster. Inference cuc bo tren M1 Max. 2,855 test. Chi thanh toan crypto (USDT/USDC).

Co goi FREE. Khong can the tin dung.

**Tweet 7/7 (CTA):**

Thu tai: https://cashclaw.cc
API health: https://api.cashclaw.cc/health

Gia: FREE / STARTER $19 / PRO $99 / ENTERPRISE $299 moi thang.

Co cau hoi? De o phan binh luan.

---

## 3. Discord Announcement

**Target audience:** Prediction market communities, Polymarket Discord, algo trading servers
**Tone:** Short, punchy, emoji-forward, community-native
**Format:** Discord embed-style message

---

### ENGLISH VERSION

**@here**

**CashClaw -- 52+ AI prediction market strategies, self-hosted, crypto billing**

Running a solo quant desk is hard. CashClaw makes it systematic.

**What you get:**
- 52+ strategies across Polymarket CLOB, CEX, DEX
- Kelly-optimal position sizing on every signal
- AI Co-pilot: ask questions, get live answers
- Strategy marketplace for community alpha
- Telegram bot for mobile monitoring

**Stack:** Node.js + TypeScript | M1 Max local inference | 2,855 tests

**Pricing:**
FREE -- basic scanning
STARTER $19/mo -- full strategy set + marketplace
PRO $99/mo -- AI Co-pilot + Telegram /ask
ENTERPRISE $299/mo -- custom strategies, dedicated infra

Crypto billing only (USDT/USDC via NOWPayments).

**Try it:** https://cashclaw.cc
**Status:** https://api.cashclaw.cc/health

Questions? Drop them in the thread.

---

### TIENG VIET (PHIEN BAN TIENG VIET)

**@here**

**CashClaw -- 52+ chien luoc AI prediction market, tu host, thanh toan crypto**

Chay ban giao dich prediction market don doc kho. CashClaw lam he thong hoa cho ban.

**Ban nhan duoc gi:**
- 52+ chien luoc tren Polymarket CLOB, CEX, DEX
- Kelly-optimal sizing moi tin hieu
- AI Co-pilot: hoi cau hoi, nhan tra loi truc tiep
- Chua luoc chien luoc (marketplace) cho alpha cong dong
- Telegram bot giam sat tren di dong

**Stack:** Node.js + TypeScript | Inference cuc bo M1 Max | 2,855 test

**Gia:**
FREE -- quet co ban
STARTER $19/thang -- bo chien luoc day du + marketplace
PRO $99/thang -- AI Co-pilot + Telegram /ask
ENTERPRISE $299/thang -- chien luoc tuy chinh, infra rieng

Thanh toan chi bang crypto (USDT/USDC qua NOWPayments).

**Thu tai:** https://cashclaw.cc
**Trang thai:** https://api.cashclaw.cc/health

Co cau hoi? De o thread phan hoi.

---

## 4. Hacker News -- Show HN

**Target audience:** Hacker News readers, technical founders, indie builders
**Tone:** Technical, architecture-first, why-it-exists narrative
**Format:** Show HN post, 450-500 words

---

### ENGLISH VERSION

**Title:** Show HN: CashClaw -- Self-hosted prediction market trading desk with 52 AI strategies

**Body:**

I built CashClaw (https://cashclaw.cc) because most prediction market traders size positions by gut feel. Kelly-optimal sizing is well-understood math, but nobody applies it because the tooling is too complex or too expensive.

CashClaw is a self-hosted AI trading platform for prediction markets. It runs 52+ strategies across Polymarket V2 (CLOB), centralized exchanges, and decentralized exchanges -- with Kelly position sizing baked into every signal.

**Architecture:**

The core is a strategy engine built on Fastify 5 + TypeScript. Each strategy is a standalone module with a shared risk layer. Signals flow through a risk gate that applies Kelly sizing, drawdown limits, and circuit breakers before any order reaches the CLOB.

```
Strategy Engine (52+ modules)
        |
    Risk Gate
    (Kelly sizing, drawdown limits, circuit breaker)
        |
    Execution Layer
    (Polymarket CLOB, CEX, DEX adapters)
```

**Dual-model inference:**

Two local models handle different latency tiers:
- Nemotron-3 Nano: fast regime classification (5m, 1h timeframes)
- DeepSeek R1: deep signal analysis for dislocation timing

Both run locally on M1 Max with TPU. Zero cloud API costs, zero latency surprises.

**AI Co-pilot:**

A natural language interface to the trading desk. Users ask questions like "what's my risk exposure?" or "find arbitrage opportunities" and get live answers with data from strategies, risk models, and market feeds. Five intent handlers run in parallel with a 5-second timeout.

**Strategy marketplace:**

Users can publish strategies to a community marketplace. Others subscribe. This creates a flywheel: more strategies attract more users, which attract more strategy publishers.

**Key design decisions:**

1. **Self-hosted first.** No cloud dependency. You run your own infrastructure.
2. **Crypto billing only.** USDT/USDC via NOWPayments. No Stripe, no PayPal, no fiat.
3. **Local inference.** M1 Max + TPU. No OpenAI/Claude API calls in the hot path.
4. **2,855 tests.** Full integration suite. Production Docker stack.

**Stack:** Node.js, TypeScript, Fastify 5, React 19, Prisma, PostgreSQL, Redis Cluster, Docker.

**Pricing:** FREE tier (basic scanning), STARTER $19/mo, PRO $99/mo, ENTERPRISE $299/mo.

Live at https://cashclaw.cc. API at https://api.cashclaw.cc. Health check at https://api.cashclaw.cc/health.

I'm happy to discuss architecture decisions, the Kelly sizing implementation, or the dark-edge signal layer.

---

### TIENG VIET (PHIEN BAN TIENG VIET)

**Tieu de:** Show HN: CashClaw -- Ban giao dich prediction market tu host voi 52 chien luoc AI

**Noi dung:**

Toi da xay dung CashClaw (https://cashclaw.cc) vi hau het trader prediction market chon vi the bang cam quan. Kelly-optimal sizing la phuong phap toan hoc da duoc chung minh nhung khong ai su dung vi cong cu qua phuc tap hoac qua dat.

CashClaw la nen tang giao dich AI tu host danh cho prediction market. No chay 52+ chien luoc tren Polymarket V2 (CLOB), san giao dich tap trung (CEX) va san giao dich phi tap trung (DEX) -- voi Kelly sizing tich hop vao moi tin hieu.

**Kien truc:**

Core la strategy engine xay dung tren Fastify 5 + TypeScript. Moi chien luoc la module doc lap voi risk layer chung. Tin hieu di qua risk gate ap Kelly sizing, gioi han drawdown va circuit breaker truoc khi lenh den CLOB.

```
Strategy Engine (52+ module)
        |
    Risk Gate
    (Kelly sizing, gioi han drawdown, circuit breaker)
        |
    Execution Layer
    (Polymarket CLOB, CEX, DEX adapter)
```

**Inference doi mau:**

Hai model cuc bo xu ly o muc do tre khac nhau:
- Nemotron-3 Nano: phan loai thi truong nhanh (5m, 1h)
- DeepSeek R1: phan tich tin hieu sau cho thoi diem lech gia

Ca hai chay cuc bo tren M1 Max voi TPU. Khong chi phi API cloud, khong bat ngo ve do tre.

**AI Co-pilot:**

Giao dien ngu nhien ket noi truc tiep den ban giao dich. Nguoi dung hoi cau hoi nhu "risk exposure cua toi the nao?" hay "tim co hoi arbitrage" va nhan cau tra loi truc tiep tu chien luoc, mo hinh risk va feed thi truong. 5 intent handler chay song song voi thoi hanh 5 giay.

**Chua luoc chien luoc (marketplace):**

Nguoi dung co the cong khai chien luoc len marketplace cong dong. Nguoi khac dang ky. Tao vong lap: nhieu chien luoc hon thu hut nhieu nguoi dung hon, thu hut nhieu nguoi cong khai chien luoc hon.

**Quyet dinh thiet ke chinh:**

1. **Tu host truoc.** Khong phu thuoc cloud. Ban chay infrastructure rieng.
2. **Chi thanh toan crypto.** USDT/USDC qua NOWPayments. Khong Stripe, khong PayPal, khong fiat.
3. **Inference cuc bo.** M1 Max + TPU. Khong goi API OpenAI/Claude o duong nong.
4. **2,855 test.** Bo test integration day du. Stack Docker san sang production.

**Stack:** Node.js, TypeScript, Fastify 5, React 19, Prisma, PostgreSQL, Redis Cluster, Docker.

**Gia:** Goi FREE (quet co ban), STARTER $19/thang, PRO $99/thang, ENTERPRISE $299/thang.

Truy cap: https://cashclaw.cc. API: https://api.cashclaw.cc. Health check: https://api.cashclaw.cc/health.

San sang trao doi quyet dinh kien truc, logic Kelly sizing, hoac dark-edge signal layer.

---

## 5. Usage Notes & Distribution Checklist

**Before posting on any channel:**

- [ ] Verify https://cashclaw.cc loads and looks correct
- [ ] Verify https://api.cashclaw.cc/health returns 200
- [ ] Check all links in the post are live
- [ ] Ensure signup flow works end-to-end
- [ ] Test Telegram bot responds to /start

**Channel-specific notes:**

| Channel | Best time to post (UTC) | Thread/follow-up strategy |
|---------|------------------------|---------------------------|
| Reddit r/algotrading | Tue-Thu 14:00-18:00 | Answer every comment within 2 hours |
| Twitter/X | Mon-Fri 13:00-16:00 | Quote-tweet with follow-up data after 24h |
| Discord | Weekday evenings | Pin the announcement, run AMA within 48h |
| Hacker News | Tue-Thu 10:00-14:00 | Reply to every technical question same day |

**Content rules:**
- Never mention "AI-generated" or "built with AI" anywhere
- Never mention model names (Nemotron, DeepSeek, etc.) in non-technical posts
- Always include the health check URL as proof of uptime
- FREE tier is the primary hook -- lead with "no credit card required"
- Link to landing page (cashclaw.cc) not API directly

**Hashtags (Twitter/Discord):**
`#PredictionMarkets #AlgoTrading #Polymarket #KellySizing #CryptoTrading #QuantTrading #SelfHosted`

---

## 6. SEO Metadata (for any blog cross-posting)

**Primary keyword:** prediction market trading bot
**Secondary keywords:** Kelly sizing, algorithmic trading, Polymarket bot, self-hosted trading, arbitrage strategies
**SEO title:** CashClaw: Self-Hosted Prediction Market Trading Desk with 52 AI Strategies and Kelly Sizing
**SEO description:** Run 52+ AI strategies on prediction markets with Kelly-optimal position sizing. Self-hosted, crypto billing, AI Co-pilot included. Free tier available.
**URL slug:** `/blog/introducing-cashclaw-prediction-market-trading-desk`

---

## 7. FAQ (for comments/replies)

**Q: Is this open source?**
A: No. CashClaw is a hosted platform with a self-hosted deployment option. The source code is not public.

**Q: Does this work with Polymarket only?**
A: No. It supports Polymarket V2 (CLOB), centralized exchanges, and decentralized exchanges. Polymarket is the primary market but strategies are not limited to it.

**Q: What's the minimum capital to start?**
A: There's no minimum on the platform side. Your capital requirements depend on the strategies you run. Kelly sizing will adjust position sizes based on your bankroll.

**Q: Can I run this on a VPS?**
A: Yes. The Docker stack runs anywhere Docker runs. Recommended: 4 vCPU, 8GB RAM minimum. M1 Max or equivalent for local inference.

**Q: How does billing work?**
A: Crypto only. USDT or USDC via NOWPayments. No credit card, no Stripe, no fiat. You can start on the FREE tier with no payment required.

**Q: What's the AI Co-pilot?**
A: A natural language interface. Ask "what's my risk?" or "find arb opportunities" and get live answers from your strategies and market data. Available on PRO tier ($99/mo) and above.

**Q: How many strategies are actually active?**
A: 52+ strategy modules are implemented. The number of active strategies depends on your tier and configuration. FREE tier gets basic scanning. Full strategy set available on STARTER ($19/mo) and above.

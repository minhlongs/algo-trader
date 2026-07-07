# GTM Phase 1 Report — Go-to-Market

_SCOUT ONLY. No code changes. All setup below requires manual user action._

**Branding issue flagged:** Marketing assets alternate between "algo-trader" and "CashClaw." The landing page, dashboard, and GitHub use "CashClaw" consistently. Launch posts in `docs/marketing/launch-posts-ready-to-post.md` use only "CashClaw." The `docs/discord-announce.md` uses "algo-trader." User must confirm which brand is primary before posting publicly.

---

## A. Discord Setup Checklist

All steps require manual action at https://discord.com/developers. No code depends on this being ready.

### 1. Create a Discord Application

- [ ] Open https://discord.com/developers/applications
- [ ] Click "New Application" and name it (e.g. "CashClaw")
- [ ] In the left sidebar, open **Bot**
- [ ] Click "Add Bot" (confirm you are not making a user account)
- [ ] Under **USERNAME**, set display name (e.g. "CashClaw Bot")
- [ ] Under **Privileged Gateway Intents**:
  - [ ] Toggle ON: **Message Content Intent** (needed for command parsing)
  - [ ] Toggle ON: **Server Members Intent** (if using leaderboard)
- [ ] Click "Copy" next to the **TOKEN** field and save it (you'll need it later)
- [ ] Under **OAuth2 > URL Generator**:
  - [ ] Tick scopes: `bot` and `applications.commands`
  - [ ] Under **Bot Permissions**:
    - [ ] Send Messages
    - [ ] Embed Links
    - [ ] Attach Files
    - [ ] Read Message History
    - [ ] Use Slash Commands
  - [ ] Copy the generated URL
- [ ] Paste that URL into any browser — accept the invite to your own test server first

### 2. Create the Community Server

- [ ] Open https://discord.new in a logged-in browser (creates a server automatically)
- [ ] Name the server: **CashClaw — Algo Traders**
- [ ] Set upload limit to 50MB (free tier = 25MB; 50MB requires setting a verification level)
- [ ] In **Server Settings > Overview**, set:
  - [ ] Server icon/banner (branding)
  - [ ] Verification level: Medium (email verified)
  - [ ] Explicit content filter: Scan all members

### 3. Create Channels

| # | Channel Name | Purpose | Required? |
|---|---|---|---|
| [ ] | `#welcome` | Bot rules + onboarding | Yes |
| [ ] | `#announcements` | Launch posts, updates (read-only for users) | Yes |
| [ ] | `#signals` | Trade signals from bot | Yes |
| [ ] | `#general` | Free discussion | Yes |
| [ ] | `#support` | Help & troubleshooting | Yes |
| [ ] | `#strategies` | Strategy discussions | Recommended |
| [ ] | `#showcase` | Community P&L screenshots | Optional |

### 4. Post the Ready-Made Announcement

Copy from `docs/marketing/discord-announce.md` and post in `#announcements` after server is live.

### 5. Create a Permanent Invite Link

- [ ] Right-click the `#general` channel → "Create Invite"
- [ ] Set "Expire After" → Never
- [ ] Set "Max Uses" → Unlimited
- [ ] Click Copy Link
- [ ] Save the link (format: `https://discord.gg/XXXXXXXX`)

### 6. Add Invite Link to Landing Page

File to edit: `src/platform/landing/public/index.html`

Two places need the invite URL:

**Line 684** — Starter tier features list already says "Community Discord access" but has NO link:
```html
<li>Community Discord access</li>
```
Change to:
```html
<li><a href="https://discord.gg/YOUR_INVITE" target="_blank" rel="noopener">Community Discord access</a></li>
```
> Use your actual invite link. `target="_blank" rel="noopener"` keeps it consistent with best practice.

**After line 705 (St tier CTA) or near the footer** — add a Discord join block. Suggested insertion after the `#btn-starter` block:
```html
<a href="https://discord.gg/YOUR_INVITE" class="cc-button cc-button--secondary" target="_blank" rel="noopener" style="width:100%;text-align:center;margin-top:var(--space-2)">Join Discord Community</a>
```

---

## B. Telegram Bot Setup Checklist

Per the plan: **MANUAL — user must interact with @BotFather directly.**

### 1. Create the Bot via @BotFather

- [ ] Open Telegram app / web.telegram.org
- [ ] Search for **@BotFather** (verified: has a blue checkmark)
- [ ] Tap **Start** or send `/start`
- [ ] Send `/newbot`
- [ ] Enter bot display name (e.g. "CashClaw Signals Bot") 
- [ ] Enter bot username (e.g. "CashClawSignalsBot") — must end in `bot` and be unique
- [ ] BotFather replies with an HTTP API token — **copy it immediately**
  > Token format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz-12345`
  > Save it securely (it is a password equivalent).

### 2. Set Bot Commands in @BotFather

Send each command to @BotFather:

- [ ] `/setcommands` → Select your bot → paste:
```
start - Khởi động bot / Start the bot
help - Hiển thị trợ giúp / Show help
status - Kiểm tra trạng thái / Check status
link - Liên kết license key / Link license key
unlink - Hủy liên kết / Unlink license key
notifications - Tắt/bật thông báo / Toggle notifications
limits - Kiểm tra giới hạn API / Check API limits
balance - Xem số dư / View balance
positions - Vị thế hiện tại / Current positions
pnl - Báo cáo P&L / P&L report
campaign - Chiến dịch / Campaign
results - Kết quả / Results
faq - Câu hỏi thường gặp / FAQ
support - Hỗ trợ / Support
pricing - Bảng giá / Pricing
leaderboard - Bảng xếp hạng / Leaderboard
ask - Hỏi AI / Ask AI
```
- [ ] `/setdescription` → Paste bot description
- [ ] `/setabouttext` → Paste about text
- [ ] `/setuserpic` → Upload a profile picture (logo)

### 3. Configure Environment Variable

File: `.env` at project root.

- [ ] Add: `TELEGRAM_BOT_TOKEN=<token-from-botfather>`
- [ ] Verify no trailing slash or newline

### 4. Verify Bot Responds

- [ ] Open Telegram → search for your bot's username → tap Start
- [ ] Send `/start` — expect a welcome message
- [ ] Send `/help` — expect a help listing
- [ ] The bot code at `src/platform/telegram/bot.ts` already handles: `start`, `help`, `status`, `link`, `unlink`, `notifications`, `limits`, `balance`, `positions`, `pnl`, `campaign`, `results`, `faq`, `support`, `pricing`, `leaderboard`, `ask`

### 5. Required Dependencies Already in Code

The bot uses `grammy` library (confirmed from import at line 7 of `bot.ts`). No code changes needed — the infrastructure is ready with token only.

---

## C. Twitter/X Content

Ready to copy-paste. Replace `<@handle>` with the account username. Replace `<INSERT>` placeholders with real data before posting.

### Step 1: Create the Account

- [ ] Go to https://x.com/i/flow/signup
- [ ] Use handle format: `@CashClawQuant` or `@CashClawTrading`
- [ ] Fill bio: "Algorithmic arbitrage on crypto markets. Zero directional risk. Open-source bot. quant.cashclaw.cc"
- [ ] Pinned tweet: the T-0h launch thread below (Tweet 1)
- [ ] Update docs/social-accounts.md handle/URL once created

### Step 2: Launch Thread (7 tweets) — Post Sequentially

```
Tweet 1:
Crypto arbitrage: buy low on Exchange A, sell high on Exchange B.
Same asset. Zero directional risk.
The opportunity existed for 3 seconds.
A human can't act fast enough.
We built the bot.

A thread on how it works 🧵
```

```
Tweet 2:
The problem with retail crypto trading:
• You buy tops, sell bottoms — emotions decide
• You can't monitor 100+ exchanges 24/7
• Partial fills kill arbitrage before it starts
• Fees you don't model eat your edge

Result: Most retail traders lose.
```

```
Tweet 3:
We built something different.

An arbitrage engine that:
• Scans 100+ exchanges via WebSocket (not REST polling)
• Detects opportunities with <50ms latency
• Auto-executes with atomic multi-leg orders
• Ships with 4 arbitrage strategies built-in

Zero directional risk. Always market neutral.
```

```
Tweet 4:
How it actually works:

1. WebSocket streams feed price data 24/7
2. Opportunity detector runs in <50ms (pre-computed triangular routes)
3. Profitability calculator subtracts fees + slippage
4. Execution engine: atomic orders, auto-retry, gas estimation

Live performance Q1 2026: 94.2% win rate, Sharpe 3.8
```

```
Tweet 5:
Four strategies, out of the box:

1. Simple 2-Leg — detect + execute on two exchanges (45% of trades)
2. Triangular — ring trade on a single exchange (38% of trades)
3. DEX-CEX — exploit lag between centralized and decentralized (17% of trades)
4. Funding Rate — perpetual futures basis (Q2 roadmap)

Open source. MIT license.
```

```
Tweet 6:
Safety first:
• No leverage (always 1x)
• No directional exposure (always hedged)
• No illiquid pairs (min $1M/24h volume)
• Auto-pause on 3 consecutive losses
• Daily loss limit: -2% = stop trading
• API keys with no withdrawal permission

Your capital, your keys, our math.
```

```
Tweet 7:
Ready to build?

Open-source arbitrage bot:
• Node.js + TypeScript
• PostgreSQL + TimescaleDB
• Grafana monitoring dashboard
• 87% test coverage, 2,492 tests

Free tier: 10 calls/min
Pro ($49/mo): Auto-trading + triangular
Enterprise ($499/mo): Unlimited + DEX-CEX

Links in bio. Not financial advice. DYOR.
```

### T+24h Follow-up (fill in real data first)

```
[INSERT: signups count] traders signed up in the first 24 hours.

[INSERT: signals generated] arbitrage opportunities detected.
[INSERT: most popular strategy] remains the top performer.

Early data is in.
The 50ms execution pipeline is working.

If you want to run this yourself — full open source, MIT license.
Link in bio. 🚀
```

---

## D. Landing Page Integration

Confirmed integration points in `src/platform/landing/public/index.html`:

| Location | Line | Content | Action Required |
|---|---|---|---|
| Starter tier features | ~684 | "Community Discord access" (plain text) | Wrap in `<a>` pointing to invite link |
| Pricing section | After ~705 (Starter CTA) | No Discord CTA exists | Add a "Join Discord" button below the tier cards in the footer area |
| Footer | ~787 | Footer text ends at `</footer>` | Optionally add Discord icon/link block |

**No build step required** — the landing server (`landing-server.ts`) serves static files from `public/`. Edit the HTML file, restart the server, changes are live.

**Server startup location**: `src/platform/landing/landing-server.ts` line 61 — `createLandingServer(port)`. No build pipeline; plain static file serving.

---

## E. Blockers and Manual Actions Required

| # | Blocker | Who Takes Action | Dependency | Impact if Blocked |
|---|---|---|---|---|
| 1 | Discord app + bot creation on discord.com/developers | User | None | Cannot post launch announcement; Discord invite link unavailable for landing page |
| 2 | @BotFather bot token | User | None | Telegram bot cannot start; `TELEGRAM_BOT_TOKEN` env var stays empty |
| 3 | Discord server invite link (permanent, unlimited) | User | BlockItem 1 | Cannot embed Discord link in landing page Starter tier |
| 4 | Twitter/X account @CashClaw* | User | None | Cannot post launch thread |
| 5 | Brand confirmation | User | None | Marketing assets use "CashClaw" for landing/dashboard but "algo-trader" in discord-announce.md — posting with wrong name causes confusion |
| 6 | Polymarket account creation | User | None | Social-accounts.md shows status: PENDING |

### Environment Variables That Need Values

| Variable | Source | Blocked Until |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather | BlockItem 2 |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal | BlockItem 1 |
| `DISCORD_INVITE_LINK` | Created in step 5 above | BlockItem 1 + 3 |

### What's Ready (No Code Changes Needed)

- [x] Telegram bot command handlers exist and are wired: `start`, `help`, `status`, `link`, `unlink`, `notifications`, `limits`, `balance`, `positions`, `pnl`, `campaign`, `results`, `faq`, `support`, `pricing`, `leaderboard`, `ask`
- [x] Landing page HTML is ready for Discord link injection
- [x] Twitter thread content is copy-paste ready (7 tweets + follow-up templates)
- [x] Discord announcement text is copy-paste ready in `docs/marketing/discord-announce.md`
- [x] Technical blog is written in `docs/marketing/blog-arbitrage-engine.md`

---

## Post-Setup Verification

Once all blockers above are resolved, verify:

```bash
# 1. Telegram bot responds
node -e "
  const { TelegramBotService } = require('./src/platform/telegram/bot.ts');
  // Send /start to your bot via Telegram app
  // Expect: welcome message from handleStart
"
```

```bash
# 2. Landing page serves Discord link
curl -s http://localhost:3000/ | grep -i discord
# Should show the invite URL if added
```

```bash
# 3. Discord bot receives commands
# Post in #announcements from your discord-announce.md content
# Expect bot to not error (no errors in server logs)
```

---

_Report generated: 2026-07-06_
_Source files reviewed: docs/marketing/discord-announce.md, docs/marketing/launch-posts-ready-to-post.md, docs/marketing/blog-arbitrage-engine.md, docs/social-accounts.md, src/platform/telegram/bot.ts, src/platform/landing/public/index.html, src/platform/landing/landing-server.ts_

_Branding conflict noted: "algo-trader" vs "CashClaw" — requires user decision before public posts._

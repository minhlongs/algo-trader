# Live Trading Runbook

> Van hanh he thong Polymarket Live Trading tren Algo Trader.
> Vietnamese (with English command references). Danh cho operator (khong can technical background).

---

## 1. PAPER_MODE Env Var — Trang thai hien tai / Current Status

### Cach PAPER_MODE duoc kiem tra / Where PAPER_MODE is checked

| File | Line | Behavior |
|------|------|----------|
| `src/desk/polymarket/live-trading-orchestrator.ts` | 89-90 | `process.env['PAPER_MODE']` — defaults to `true` (paper). Config `paperTrading` field overrides env var. |
| `src/desk/cli/cashclaw-trade-commands.ts` | 36, 43 | `process.env['PAPER_MODE']` — display-only (orchestrator decides). |

### Hien trang / Current State

- **Default:** PAPER mode (no API keys needed).
- **No schema validation:** There is NO `env-schema.ts` in this project. `PAPER_MODE` is read raw from `process.env` with no Zod/Joi schema. Any value (including typos) defaults to paper.
- **CLI override:** The `--mode` flag (`paper`/`live`) on `trade start` / `trade run` overrides `PAPER_MODE` via `paperTrading` config field.
- **Guard behavior:** In PAPER mode, `LiveExecutionGuard.setEnabled(false)` — the guard passes all orders.

### Env var co ban / Recommended .env

```bash
# PAPER mode (default — no API keys needed)
PAPER_MODE=true

# To switch to LIVE, also set:
POLYMARKET_API_KEY=...
POLYMARKET_API_SECRET=...
POLYMARKET_PASSPHRASE=...
POLYMARKET_PRIVATE_KEY=...
```

---

## 2. Cau hinh / Configuration

### Actual LiveTradingConfig (from source)

```typescript
// src/desk/polymarket/live-trading-orchestrator.ts
interface LiveTradingConfig {
  paperTrading: boolean;        // true = PAPER, false = LIVE
  capitalUsdc: number;          // Total capital allocated (USDC)
  maxPositionFraction?: number; // Per-position limit (default: 0.02 = 2%)
  maxDailyDrawdown?: number;    // Daily loss limit (default: 0.05 = 5%)
  maxConcurrentPositions?: number; // Max open positions (default: 10)
  maxConsecutiveLosses?: number;   // Circuit breaker loss streak (default: 3)
}
```

### Guard Settings

| Check | Actual Default (code) | Runbook (old) | Mo ta |
|-------|-----------------------|---------------|-------|
| Position size | **2%** of capital | 20% | Tu choi lenh vuot qua 2% capital |
| Daily drawdown | **5%** of capital | 20% | Ngat toan bo neu lo qua 5% trong ngay |
| Concurrent positions | **10** max | 5 | Tu choi lenh khi dat max positions |
| Circuit breaker | **3** consecutive losses | Not documented | Ngat khi co 3 lenh lo lien tiep |

**PAPER mode:** Guard bi vo hieu hoa (guard.enabled = false, tat ca lenh deu pass).

### Redis Circuit Breaker

A separate `CircuitBreaker` (Redis-backed, `src/desk/risk/circuit-breaker.ts`) also protects trading:

| Check | Default | Mo ta |
|-------|---------|-------|
| Loss streak | 3 | Trips circuit breaker |
| Latency spike | 1000ms | Trips if API latency exceeds threshold |
| Volatility spike | 5% | Trips if volatility exceeds threshold |
| Daily drawdown | 5% | Trips via DrawdownMonitor |
| Cooldown | 5 minutes | Auto-recover after cooldown (HALF_OPEN) |

**Requires Redis** to function. If Redis is unavailable, circuit breaker checks are skipped.

### Luu y quan trong / Important Notes

- The **actual** guard defaults are MUCH tighter than the old runbook claimed (2% vs 20% position, 5% vs 20% drawdown).
- The CLI `trade start` confirmation correctly shows the real values:
  - `2% max position, 5% daily loss, 10 max positions, 3-loss circuit breaker`
- These defaults come from `LiveExecutionGuard` (`src/desk/execution/live-execution-guard.ts` lines 60-66).

---

## 3. Paper Trading Workflow

### Buoc 1: Kiem tra danh sach strategy

```bash
algo trade list-strategies
# Output: 52+ strategies kem mo ta
```

### Buoc 2: Chay paper trading

```bash
# Single strategy, 10 ticks
algo trade run --strategy=spread-mean-reversion --mode=paper --ticks=10

# Multiple strategies
algo trade run --strategy=spread-mean-reversion,momentum-cascade --mode=paper --ticks=20

# All strategies
algo trade run --strategy=all --mode=paper --ticks=20 --capital=10000
```

### Buoc 3: Xem ket qua

```bash
# Trang thai hien tai
algo trade status

# Journal: fills, events, P&L
algo trade journal --type=all --limit=20
algo trade journal --type=fills
algo trade journal --type=pnl
```

### Buoc 4: Backtest strategy

```bash
# Backtest 30 ngay
algo trade backtest --strategy=spread-mean-reversion --days=30 --capital=5000

# JSON output (cho script)
algo trade backtest --strategy=momentum-cascade --days=7 --format=json
```

---

## 4. Paper to Live Transition Procedure / Quy trình chuyển từ Paper sang Live

### Prerequisites — Dieu kien bat buoc truoc khi chay LIVE / Mandatory Conditions Before Going Live

Tat ca cac dieu kien nay PHAI thoa MAN / All these conditions MUST be met before going live:

| # | Dieu kien | Verification method |
|---|-----------|---------------------|
| 1 | **12 strategies pass paper trading** — at least 48 gio (hours) with tracked P&L | `algo trade status` — check no unhandled errors for 24+ hours |
| 2 | **RiskGateManager thresholds confirmed** — 2% bankroll, 5% daily loss, 3 consecutive losses circuit breaker | Review Section 5 thresholds |
| 3 | **No unhandled errors** — 24+ hours with no errors in any strategy tick | Check PM2 logs for absence of ERROR lines |

### Step-by-Step Transition / Quy trình chuyen đổi từng buoc

**Buoc 1 / Step 1:** Set live mode environment variable

```bash
# Method 1: Edit .env file (recommended)
# Find PAPER_MODE=true and change to:
PAPER_MODE=false

# Method 2: Export for current session only
export PAPER_MODE=false
```

How it works: `LiveTradingOrchestrator` constructor receives `paperTrading: boolean` in `LiveTradingConfig`. When `false`, it calls `LiveExecutionGuard.setEnabled(true)` — all orders now pass through the guard checks.

**Buoc 2 / Step 2:** Start with ONE strategy only

```bash
# Example: momentum-exhaustion strategy (read: "mo-men-tum ex-haws-chun")
algo trade run --strategy=momentum-exhaustion --mode=live --capital=1000 --ticks=0
# --ticks=0 = runs indefinitely until Ctrl+C stops it
```

Effect: Strategy runs through `RiskGateManager.check(strategyKey, order)` before every order. Each order is also validated by `LiveExecutionGuard.guardOrder()` which checks: position size, daily drawdown, concurrent positions limit, and circuit breaker.

**Buoc 3 / Step 3:** Verify LiveExecutionGuard activates correctly

```bash
# Via CLI status command
algo trade status
# Look for: enabled=true in the guard output

# Programmatically (for debugging):
const orch = new LiveTradingOrchestrator(config)
const status = orch.getGuardStatus()
// Returns: { enabled: boolean, circuitTripped: boolean, dailyPnl: number, consecutiveLosses: number, ... }
```

Expected result: `enabled: true` — means all orders must pass through 4 guard checks (position size, drawdown, concurrent limit, circuit breaker).

**Buoc 4 / Step 4:** Monitor for 1 hour before adding second strategy

- Watch P&L: `algo trade journal --type=pnl`
- Watch fills: `algo trade journal --type=fills --limit=20`
- Check guard state: `algo trade status` (shows circuitTripped, dailyPnl, consecutiveLosses)
- Watch PM2 logs: `pm2 logs algo-trade` — look for any ERROR lines

If all clean after 1 hour, add second strategy:
```bash
# Stop current, restart with two strategies
Ctrl+C
algo trade run --strategy=momentum-exhaustion,session-vol-sniper --mode=live --capital=1000 --ticks=0
```

**Rollback / Quay lai PAPER mode:** If any issue arises, IMMEDIATELY set PAPER_MODE=true and restart:
```bash
export PAPER_MODE=true
algo trade run --strategy=momentum-exhaustion --mode=paper --capital=1000 --ticks=0
```

### Per-Strategy Live Toggle / Dieu khien strategy tung cai

Edit `src/desk/wiring/strategy-wiring.ts` to control which strategies run live:

```typescript
// ENABLED_IDS set — only these strategies process live signals
const ENABLED_IDS = new Set([
  'momentum-exhaustion',    // Add/remove strategies here
  'session-vol-sniper',
  // ... all 12 strategies
])
```

Each strategy tick runs through `RiskGateManager.check(strategyKey, order)` before placing any order. Strategies NOT in `ENABLED_IDS` are registered with `enabled: false`.

### Circuit Breaker Halt Procedure / Quy trình dung khi Circuit Breaker kích hoat

**What trips the breaker / Dieu kien kich hoat:**
- 3 consecutive losses (LiveExecutionGuard in-memory circuit)
- Daily drawdown >= 5% (DrawdownMonitor)
- API latency > 1000ms (CircuitBreaker Redis-backed)

When tripped: ALL trading halts immediately via `CircuitBreaker.halt(reason)`. No orders placed.

**Restart / Khoi dong lai:** Requires manual restart:
```bash
# Via orchestrator:
await orch.stop()    // Halt all trading
await orch.start()   // Resume trading (also resets circuit breaker)

// Or reset individual components programmatically:
guard.resetCircuit()            // Reset LiveExecutionGuard circuit
circuitBreaker.reset()          // Reset Redis-backed circuit breaker
drawdownMonitor.resume()        // Resume DrawdownMonitor after halt
```

### Monitoring Checklist / Danh sach kiem tra khi LIVE

| Tool | Command / Method | What to watch |
|------|------------------|---------------|
| LiveTradingJournal | `algo trade journal --type=fills` | Fill records — confirm orders executed correctly |
| DrawdownMonitor | `orch.getGuardStatus().dailyPnl` | P&L vs drawdown thresholds |
| PM2 logs (drip) | `pm2 logs welcome-drip` | Server-side events |
| PM2 logs (trading) | `pm2 logs algo-trade` | Trading engine output |
| Dashboard | `/app/risk-settings` | Risk gate UI (web) |
| Circuit state | `circuitBreaker.getStatus().state` | Should say `CLOSED` (not OPEN) |
| Guard status | `orch.getGuardStatus()` | enabled, circuitTripped, consecutiveLosses |

**Red flags requiring immediate rollback:**
- `circuitTripped: true` — consecutive loss streak detected
- `dailyPnl` approaching 5% of capitalUsdc
- `consecutiveLosses` >= 3
- Any ERROR lines in PM2 trading logs
- Unexpected order sizes or sides in fill records



## 5. Risk Gate Thresholds

### LiveExecutionGuard Checks (PRE-order)

| Check | Threshold | Behavior |
|-------|-----------|----------|
| Circuit breaker | 3 consecutive losses | All orders rejected until manual `resetCircuit()` |
| Position size | 2% of `capitalUsdc` | Single order > 2% of bankroll rejected |
| Daily drawdown | 5% of `capitalUsdc` | All orders rejected until next day or `resetDaily()` |
| Concurrent positions | 10 max | Order rejected when at capacity |

### RiskGateManager Checks (PRE-tick, in `executeStrategyTick`)

| Check | Source | Behavior |
|-------|--------|----------|
| Redis circuit breaker | `CircuitBreaker.canTrade()` | Tick skipped if OPEN |
| Daily drawdown | `LiveExecutionGuard.getStatus()` | Tick skipped if drawdown >= max |
| Concurrent limits | `LiveExecutionGuard.getStatus()` | Tick skipped if at max positions |
| Position size (order-level) | `LiveExecutionGuard.guardOrder()` | Order rejected (per-order check) |

### Circuit Breaker Layers

```
LiveExecutionGuard (in-memory circuit) ─── 3 consecutive losses → block all orders
CircuitBreaker (Redis-backed) ──────────── loss streak, latency, volatility, drawdown
```

Both must pass for a trade to execute. The `RiskGateManager.check()` wraps both.

---

## 6. CLI Command Reference

| Lenh | Mo ta |
|------|-------|
| `algo trade list-strategies` | Danh sach 52+ strategy |
| `algo trade start --mode=live` | Khoi dong orchestrator + Endgame scanner |
| `algo trade run --strategy=X` | Chay strategy (single/multi/all) |
| `algo trade status` | Vi tri, P&L, guard state |
| `algo trade journal --type=X` | Xem journal (fills/events/pnl) |
| `algo trade backtest --strategy=X` | Backtest strategy |

### Options cho `trade run`

| Option | Default | Mo ta |
|--------|---------|-------|
| `--strategy` | `spread-mean-reversion` | Ten strategy hoac comma-separated hoac `all` |
| `--mode` | `paper` | `paper` hoac `live` |
| `--capital` | `1000` | Capital USDC |
| `--ticks` | `10` | So tick truoc khi auto-stop (0=unlimited) |
| `--interval` | `15000` | Tick interval (ms) |
| `--yes` | false | Bo qua confirm (cho scripting) |

---

## 7. Journal & Data

### File locations (`~/.cashclaw/`)

| File | Noi dung |
|------|----------|
| `live-trades.jsonl` | Tung lenh fill (JSONL format) |
| `live-positions.json` | Vi tri hien tai |
| `live-pnl.json` | P&L hang ngay |
| `live-journal.jsonl` | Events (start, stop, error, rollover) |

### Journal format

```jsonl
{"type":"fill","data":{"orderId":"...","tokenId":"...","side":"BUY","price":0.52,"size":100}}
{"type":"event","data":{"event":"orchestrator_started","mode":"PAPER","timestamp":"..."}}
{"type":"pnl","data":{"realizedPnl":12.50,"tradeCount":3,"winCount":2,"lossCount":1}}
```

---

## 8. Incident Response

### Van de thuong gap

| Van de | Nguyen nhan | Cach fix |
|--------|-------------|----------|
| "Gamma API error" | API timeout hoac rate limit | Doi 60s, thu lai |
| "Guard rejected" | Vuot position size hoac drawdown | Giam capital hoac tang limit |
| "Unknown strategy" | Sai ten strategy | Dung `list-strategies` de kiem tra |
| Orchestrator khong start | Thieu API keys | Kiem tra `.env` |
| Journal trong | PAPER mode khong fill | Binh thuong — strategy khong tim thay tin hieu |
| Circuit breaker tripped | 3 consecutive losses / 5% drawdown | Reset thu cong hoac doi cooldown 5 phut |
| Redis connection error | Circuit breaker unavailable | Trading tiep (Redis check skipped), kiem tra Redis |

### Emergency Stop

```bash
# Ctrl+C dung orchestrator ngay lap tuc
# State duoc persist tu dong khi stop:
#   - live-positions.json
#   - live-pnl.json
#   - live-trades.jsonl
#   - live-journal.jsonl
# Tat ca file journal van con trong ~/.cashclaw/
```

### Rollback — Quay lai PAPER mode

```bash
# Cach 1: Set env var (nhanh nhat)
export PAPER_MODE=true
algo trade start --mode=paper --capital=1000

# Cach 2: CLI flag (khong can sua .env)
algo trade start --mode=paper --capital=1000

# Cach 3: Xoa state + reset circuit breaker (sau khi co su co)
rm ~/.cashclaw/live-*.json ~/.cashclaw/live-*.jsonl
# Reset Redis circuit breaker (optional)
redis-cli DEL circuit_breaker:status
redis-cli DEL circuit_breaker:loss_streak

# Cach 4: Thay doi default .env (tranh vo tinh bat LIVE)
# Trong .env:
PAPER_MODE=true
```

**Khong co "kill switch" dedicated** — operator can:
1. Ctrl+C de stop orchestrator
2. Set `PAPER_MODE=true`
3. Start lai

---

## 9. Architecture Overview

```
CLI (cashclaw-cli.ts)
  +-- handleTradeStart / handleTradeRun
       +-- LiveTradingOrchestrator
       |    +-- buildPolymarketAdapter() -> adapter (null in PAPER) or CLOB adapter
       |    +-- LiveOrderManager (only in LIVE)
       |    +-- LiveExecutionGuard (DISABLED in PAPER, ENABLED in LIVE)
       |    |    +-- 4 checks: circuit breaker, position size, drawdown, concurrent
       |    +-- LivePositionTracker
       |    +-- LiveTradingJournal
       |    +-- RiskGateManager
       |         +-- CircuitBreaker (Redis-backed)
       |         +-- LiveExecutionGuard (in-memory)
       +-- StrategyLiveBridge
            +-- Endgame scanner
            +-- Signal processing pipeline
```

---

## 10. Security & Safety

### LIVE mode datagates

| Gate | Location | What it protects |
|------|----------|------------------|
| Env var validation | 3 locations (orchestrator, adapter, CLI) | Prevents LIVE start without API keys |
| Interactive confirm | `handleTradeStart()`, `handleTradeRun()` | Human verification before real orders |
| `--yes` flag | CLI options | Skip confirm only when explicitly passed |
| LiveExecutionGuard | Every order in LIVE | Position size, drawdown, circuit breaker, concurrent |
| RiskGateManager | Every strategy tick | Global risk + circuit breaker check |

### Alerting (chua co / not yet implemented)

- No email/SMS/Telegram alerts on circuit trip or drawdown breach
- Events are logged to journal and Prometheus metrics, but no push notification
- Operator must manually `watch algo trade status` or poll journal

---

## 12. Alert Debugging / Gỡ lỗi cảnh báo

> Huong dan kiem tra va debug Alertmanager / Telegram alerts.
> Guide for checking and debugging Alertmanager / Telegram alerts.

### Kiem tra alert dang fire / Check firing alerts

```bash
# List all alerts
curl -s http://localhost:9093/api/v2/alerts | jq '.'

# List only firing alerts (status=active)
curl -s http://localhost:9093/api/v2/alerts | jq '[.[] | select(.status.state == "active")]'

# Check alert silences
curl -s http://localhost:9093/api/v2/silences | jq '.'
```

### Test Telegram notification / Kich hoat test alert

Cach nhanh nhat de test Telegram alert la trigger circuit breaker:

```bash
# 1. Simulate 3 consecutive losses (circuit breaker threshold)
#    In source code: circuit_breaker:loss_streak increment
#    Or use Redis directly:
redis-cli SET circuit_breaker:loss_streak 3
redis-cli SET circuit_breaker:state 1

# 2. Force Prometheus metric (if using custom metrics endpoint):
curl -X POST http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]={__name__="circuit_breaker_state"}

# 3. Hoac directly test Alertmanager webhook:
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {"alertname": "CircuitBreakerOpen", "severity": "critical"},
    "annotations": {"summary": "Test alert — circuit breaker is OPEN", "description": "This is a test from live-trading-runbook Section 12"},
    "generatorURL": "http://localhost:9090/graph"
  }]'
```

### Environment variables / Bien moi truong can thiet

| Variable | Required for | Ghi chu |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Alertmanager Telegram receiver | Bot token from @BotFather |
| `ALERT_CHAT_ID` | Alertmanager Telegram receiver | Chat ID (numeric, negative for group) |
| `TELEGRAM_CHAT_ID` | Grafana contact points | Grafana-specific (may differ from ALERT_CHAT_ID) |

### Troubleshooting / Xu ly su co

**Telegram khong nhan duoc message:**

1. Kiem tra bot token:
   ```bash
   # Test bot token truc tiep
   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
   # Expected: {"ok":true,"result":{"id":...,"is_bot":true,"first_name":"..."}}
   ```

2. Kiem tra chat ID:
   ```bash
   # Get updates to find your chat ID
   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates"
   # Look for "chat":{"id":...} in the response
   ```

3. Kiem tra Alertmanager logs:
   ```bash
   docker logs alertmanager --tail 50
   # Look for: "telegram" notification errors or "webhook" call failures
   ```

4. Kiem tra Grafana contact point (alternative path):
   - Grafana UI → Alerting → Contact points
   - Verify qwen-telegram-admin has correct bot token and chat ID
   - Click "Test" to send a test notification

5. Verificar webhook bridge (if using alert-webhook service):
   ```bash
   # Check webhook service is running
   curl -s http://alert-webhook:8080/health
   # Check webhook logs
   docker logs alert-webhook --tail 50
   ```

6. Network connectivity:
   ```bash
   # Can Alertmanager reach the webhook service?
   curl -s http://alert-webhook:8080/telegram -X POST \
     -H "Content-Type: application/json" \
     -d '{"text":"test"}'
   ```

### Alert rules reference

| Rule | Severity | Description | Location |
|------|----------|-------------|----------|
| CircuitBreakerOpen | critical | Trading halted by circuit breaker | `config/prometheus-alerts.yml` |
| DailyLossThresholdExceeded | critical | Daily P&L below threshold | `config/prometheus-alerts.yml` |
| ProviderDown | critical | Market data provider unavailable | `config/prometheus-alerts.yml` |

---

## 11. Lien he / Support

- **Ma nguon:** `src/desk/polymarket/`, `src/desk/cli/`, `src/desk/risk/`, `src/desk/execution/`
- **Tests:** `src/desk/polymarket/__tests__/`, `src/desk/execution/__tests__/`, `src/desk/risk/__tests__/`
- **Docs:** `docs/live-trading-runbook.md` (file nay)
- **CLAUDE.md:** `CLAUDE.md` (project root)

---

## Audit Summary

| Item | Finding |
|------|---------|
| PAPER_MODE env var | Exists, read raw from `process.env` (no schema validation). Default: `true` (paper). |
| Env schema file | `env-schema.ts` does NOT exist in this project. |
| LIVE env vars | 4 required: `POLYMARKET_API_KEY`, `_SECRET`, `_PASSPHRASE`, `_PRIVATE_KEY` (+ `POLY_*` fallbacks) |
| Risk gate defaults | Position: 2%, Drawdown: 5%, Concurrent: 10, Circuit: 3 losses |
| Guard guardEnabled | `true` in LIVE, `false` in PAPER |
| Rollback | Set `PAPER_MODE=true`, restart orchestrator. Or `Ctrl+C`, `export PAPER_MODE=true`, restart. |
| Alerting on circuit trip | Log/journal only — no push notification |
| Redis required | For CircuitBreaker. If unavailable, Redis checks are skipped. |

Status: DONE

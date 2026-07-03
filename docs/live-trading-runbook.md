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

## 4. Paper -> Live Transition Steps

### Checklist truoc khi chay LIVE

- [ ] Da test strategy trong PAPER mode it nhat 50 ticks
- [ ] Da backtest strategy it nhat 30 ngay
- [ ] Sharpe ratio > 0.5
- [ ] Win rate > 40%
- [ ] Wallet co du USDC (toi thieu $100)
- [ ] Tat ca 4 API keys da configured trong `.env`:
  - `POLYMARKET_API_KEY`
  - `POLYMARKET_API_SECRET`
  - `POLYMARKET_PASSPHRASE`
  - `POLYMARKET_PRIVATE_KEY`
- [ ] Redis dang chay (circuit breaker can Redis)
- [ ] `npm run build` passes (0 TypeScript errors)

### Buoc 1: Set PAPER_MODE=false

```bash
# Trong .env file
PAPER_MODE=false
# HOAC export truc tiep
export PAPER_MODE=false
```

### Buoc 2: Kiem tra LIVE env vars

```bash
# Verify all 4 Polymarket API vars are set
echo "POLYMARKET_API_KEY=$POLYMARKET_API_KEY"
echo "POLYMARKET_API_SECRET=$POLYMARKET_API_SECRET"
echo "POLYMARKET_PASSPHRASE=$POLYMARKET_PASSPHRASE"
echo "POLYMARKET_PRIVATE_KEY=$POLYMARKET_PRIVATE_KEY"
```

All 4 env vars are validated in 3 places:
1. `LiveTradingOrchestrator.validateLiveEnv()` (line 38)
2. `buildPolymarketAdapter()` (line 91)
3. `handleTradeStart()` and `handleTradeRun()` (CLI handlers)

Missing any one will throw an error before any order is placed.

### Buoc 3: Chay LIVE (co confirm)

```bash
# Cach 1: Start orchestrator
algo trade start --mode=live --capital=1000

# Cach 2: Run specific strategy
algo trade run --strategy=spread-mean-reversion --mode=live --capital=1000 --ticks=0
# --ticks=0 = chay vo han, Ctrl+C de dung
```

LIVE mode trigger 2 confirmation gates:
1. Env var validation (throws if missing)
2. Interactive confirmation prompt ("Confirm? (y/N)")
   - Use `--yes` flag to skip confirm (scripting)

### Buoc 4: Giam sat khi LIVE

```bash
# Trong terminal rieng
watch -n 5 'algo trade status'

# Kiem tra journal
algo trade journal --type=pnl
algo trade journal --type=fills --limit=50

# Kiem tra guard status (qua orchestrator)
# Guard shows: enabled=true, circuitTripped=boolean, dailyPnl=number
```

---

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

# Live Trading Runbook

> Vận hành hệ thống Polymarket Live Trading trên Algo Trader.
> Vietnamese (with English command references). Dành cho operator (không cần technical background).

---

## 1. Điều kiện tiên quyết / Prerequisites

### API Keys
| Key | Env Var | Cách lấy / How to get |
|-----|---------|----------------------|
| Polymarket API Key | `POLYMARKET_API_KEY` | https://polymarket.com/settings/api |
| Polymarket Secret | `POLYMARKET_SECRET` | Tạo cùng lúc với API Key |
| Polymarket Passphrase | `POLYMARKET_PASSPHRASE` | Tạo cùng lúc với API Key |
| Funded Wallet | `POLYMARKET_PROXY_WALLET` | USDC on Polygon |

### Yêu cầu / Requirements
- [ ] Node.js 20+
- [ ] USDC in Polymarket wallet (for LIVE mode)
- [ ] API keys configured in `.env`
- [ ] `npm run build` passes (0 TypeScript errors)

---

## 2. Cấu hình / Configuration

### LiveTradingConfig

```typescript
// src/desk/polymarket/live-trading-orchestrator.ts
interface LiveTradingConfig {
  paperTrading: boolean;    // true = paper mode (no real orders)
  capitalUsdc: number;       // Max USDC exposure
  maxPositionSize?: number; // Per-position limit (default: 20% capital)
  maxDrawdownPct?: number;  // Daily drawdown circuit breaker (default: 20%)
  maxConcurrent?: number;   // Max concurrent positions (default: 5)
}
```

### Guard Settings (Chỉ áp dụng LIVE mode)

| Check | Default | Mô tả |
|-------|---------|-------|
| Position size | 20% capital | Từ chối lệnh vượt quá % capital |
| Daily drawdown | -20% | Ngắt toàn bộ nếu lỗ quá ngưỡng |
| Concurrent limit | 5 | Từ chối lệnh khi đạt max positions |
| Circuit breaker | On | Ngắt khi phát hiện bất thường |

**PAPER mode:** Guard bị vô hiệu hóa (tất cả lệnh đều pass).

---

## 3. Paper Trading Workflow

### Bước 1: Kiểm tra danh sách strategy

```bash
algo trade list-strategies
# Output: 32 strategies kèm mô tả
```

### Bước 2: Chạy paper trading

```bash
# Single strategy, 10 ticks
algo trade run --strategy=spread-mean-reversion --mode=paper --ticks=10

# Multiple strategies
algo trade run --strategy=spread-mean-reversion,momentum-cascade --mode=paper --ticks=20

# All 32 strategies
algo trade run --strategy=all --mode=paper --ticks=20 --capital=10000
```

### Bước 3: Xem kết quả

```bash
# Trạng thái hiện tại
algo trade status

# Journal: fills, events, P&L
algo trade journal --type=all --limit=20
algo trade journal --type=fills
algo trade journal --type=pnl
```

### Bước 4: Backtest strategy

```bash
# Backtest 30 ngày
algo trade backtest --strategy=spread-mean-reversion --days=30 --capital=5000

# JSON output (cho script)
algo trade backtest --strategy=momentum-cascade --days=7 --format=json
```

---

## 4. Live Trading Checklist

### Trước khi chạy LIVE

- [ ] Đã test strategy trong PAPER mode ít nhất 50 ticks
- [ ] Đã backtest strategy ít nhất 30 ngày
- [ ] Sharpe ratio > 0.5
- [ ] Max drawdown < 20%
- [ ] Win rate > 40%
- [ ] Wallet có đủ USDC (tối thiểu $100)
- [ ] API keys đã configured trong `.env`

### Chạy LIVE

```bash
# Khởi động orchestrator
algo trade start --mode=live --capital=1000

# Hoặc chạy strategy cụ thể
algo trade run --strategy=spread-mean-reversion --mode=live --capital=1000 --ticks=0
# --ticks=0 = chạy vô hạn, Ctrl+C để dừng
```

### Giám sát khi LIVE

```bash
# Xem trạng thái real-time (chạy trong terminal khác)
watch -n 5 'algo trade status'

# Kiểm tra journal
algo trade journal --type=pnl
algo trade journal --type=fills --limit=50
```

---

## 5. CLI Command Reference

| Lệnh | Mô tả |
|------|-------|
| `algo trade list-strategies` | Danh sách 32 strategy |
| `algo trade start --mode=live` | Khởi động orchestrator |
| `algo trade run --strategy=X` | Chạy strategy (single/multi/all) |
| `algo trade status` | Vị trí, P&L, guard state |
| `algo trade journal --type=X` | Xem journal (fills/events/pnl) |
| `algo trade backtest --strategy=X` | Backtest strategy |

### Options cho `trade run`

| Option | Default | Mô tả |
|--------|---------|-------|
| `--strategy` | `spread-mean-reversion` | Tên strategy hoặc comma-separated hoặc `all` |
| `--mode` | `paper` | `paper` hoặc `live` |
| `--capital` | `5000` | Capital USDC |
| `--ticks` | `0` (unlimited) | Số tick trước khi auto-stop |
| `--interval` | `15000` | Tick interval (ms) |

---

## 6. Journal & Data

### File locations (`~/.cashclaw/`)

| File | Nội dung |
|------|----------|
| `live-trades.jsonl` | Từng lệnh fill (JSONL format) |
| `live-positions.json` | Vị trí hiện tại |
| `live-pnl.json` | P&L hàng ngày |
| `live-journal.jsonl` | Events (start, stop, error, rollover) |

### Journal format

```jsonl
{"type":"fill","data":{"orderId":"...","tokenId":"...","side":"BUY","price":0.52,"size":100}}
{"type":"event","data":{"event":"orchestrator_started","mode":"PAPER","timestamp":"..."}}
{"type":"pnl","data":{"realizedPnl":12.50,"tradeCount":3,"winCount":2,"lossCount":1}}
```

---

## 7. Incident Response

### Vấn đề thường gặp

| Vấn đề | Nguyên nhân | Cách fix |
|--------|------------|----------|
| "Gamma API error" | API timeout hoặc rate limit | Đợi 60s, thử lại |
| "Guard rejected" | Vượt position size hoặc drawdown | Giảm capital hoặc tăng limit |
| "Unknown strategy" | Sai tên strategy | Dùng `list-strategies` để kiểm tra |
| Orchestrator không start | Thiếu API keys | Kiểm tra `.env` |
| Journal trống | PAPER mode không fill | Bình thường — strategy không tìm thấy tín hiệu |

### Emergency Stop

```bash
# Ctrl+C dừng orchestrator ngay lập tức
# State được persist tự động khi stop
# File journal vẫn còn trong ~/.cashclaw/
```

### Rollback

```bash
# Xóa state để bắt đầu lại
rm ~/.cashclaw/live-*.json ~/.cashclaw/live-*.jsonl
```

---

## 8. Architecture Overview

```
CLI (cashclaw-cli.ts)
  └─ StrategyRunner
       ├─ GammaClientImpl → Gamma API (market data)
       ├─ Strategy (V2, BasePolymarketStrategy)
       │    └─ OrderManager → LiveOrderManagerProxy
       │         └─ StrategyLiveBridge
       │              └─ LiveTradingOrchestrator
       │                   ├─ PolymarketAdapter (CLOB)
       │                   ├─ LiveExecutionGuard
       │                   ├─ LivePositionTracker
       │                   └─ LiveTradingJournal
       └─ Shared between strategies (MultiStrategyRunner)
```

---

## 9. Liên hệ / Support

- **Mã nguồn:** `src/desk/polymarket/`
- **Tests:** `src/desk/polymarket/__tests__/`
- **Docs:** `docs/live-trading-runbook.md` (file này)

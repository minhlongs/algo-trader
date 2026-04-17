# Qwen Signal Generator Daemon

M1 Max daemon that polls market data, calls Qwen3-30B-A3B @ :11437, extracts trade signals, and POSTs them to the algo-trader CF Worker via HMAC-signed ingest endpoint.

## Architecture

```
M1 Max (every 60s)
  fetch_market_snapshot(Binance REST)
    → call_qwen(:11437 OpenAI-compat)
      → parse signal {side, confidence, reasoning}
        → HMAC-sign body
          → POST /api/v1/signals/ingest
            → CF Worker verifies → SignalPublisher fan-out (D1 + SSE + Telegram)
```

## Setup (M1 Max)

```bash
# 1. Install dependency
pip3 install httpx

# 2. Set secret (same value as CF Worker env QWEN_INGEST_HMAC_SECRET)
echo 'export QWEN_INGEST_HMAC_SECRET="your-64-hex-secret"' >> ~/.zshenv
source ~/.zshenv

# 3. Dry-run test (no actual POST)
QWEN_INGEST_HMAC_SECRET=test python3 signal-generator-daemon.py --dry-run

# 4. Install launchd agent (runs during US market hours)
#    IMPORTANT: edit plist EnvironmentVariables.QWEN_INGEST_HMAC_SECRET first
cp com.mekong.qwen-signal-daemon.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.mekong.qwen-signal-daemon.plist
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `QWEN_INGEST_HMAC_SECRET` | YES | Shared HMAC-SHA256 secret (match CF Worker) |
| `QWEN_SIGNAL_INGEST_URL` | no | Override ingest URL (default: algo-trader.pages.dev) |
| `QWEN_SERVER_URL` | no | Qwen MLX server (default: http://127.0.0.1:11437) |
| `QWEN_MODEL` | no | Model name for API call |
| `QWEN_SIGNAL_KILL` | no | Set to any value to stop daemon after current cycle |

## Kill Switch

```bash
# Instant stop (daemon exits after current 60s cycle)
launchctl setenv QWEN_SIGNAL_KILL 1

# Or permanently via ~/.zshenv
echo 'export QWEN_SIGNAL_KILL=1' >> ~/.zshenv
```

## Logs

```bash
tail -f ~/.local/logs/qwen-signal-daemon.log
tail -f ~/.local/logs/qwen-signal-daemon-err.log
```

## Notes

- All v1 signals have `strategy='qwen-m1max-v1'` — Phase 04 paper-gate treats these as paper_only
- Poll interval 60s max — respects RAM constraint (Qwen 16GB weights, M1 Max 64GB)
- launchd `ThrottleInterval=60` + `KeepAlive` limits crash-loop blast radius to ≤1 req/min
- Daemon has NO live-trade authority — signal ingestion only; execution gated by Phase 04

# Qwen3-30B-A3B MLX Server — M1 Max Runbook

**Owner:** Ops  
**Created:** 2026-04-17  
**Port:** 11437  
**Model:** `mlx-community/Qwen3-30B-A3B-4bit`  
**Host:** M1 Max (ssh via `ssh m1max-cf`)

---

## Architecture Overview

```
M1 Max 64GB RAM
├── macOS baseline            ~10GB
├── :4001  Nemotron-3-Nano-30B-A3B   (hot, idle — 0% mem lazy-loaded)
├── :4002  DeepSeek-R1-Distill-32B    (hot, active — ~20GB when loaded)
├── :4003  Qwen2.5-Coder-7B           (hot, idle)
├── :11437 Qwen3-30B-A3B-4bit [NEW]   (~18GB when loaded)
└── :11434 Ollama (fallback, max 1 model)

Budget: DeepSeek (~20GB) + Qwen3 (~18GB) + macOS (~10GB) = ~48GB / 64GB
Headroom: ~16GB for apps + kernel
```

**Security:** All MLX servers bound to `127.0.0.1`. Never exposed to WAN.  
CF Tunnel routes are for gateway/API only, not direct MLX ports.

---

## Setup (one-time provisioning)

### 1. Verify mlx-lm installed

```bash
ssh m1max-cf '/Users/macbook/mlx-env/bin/python3 -m mlx_lm.server --help | head -3'
# Expected: usage: mlx_lm.server ...
```

### 2. Download model weights (~18GB)

```bash
ssh m1max-cf 'nohup /Users/macbook/mlx-env/bin/hf download mlx-community/Qwen3-30B-A3B-4bit > /tmp/qwen3-download.log 2>&1 &'
# Monitor:
ssh m1max-cf 'tail -f /tmp/qwen3-download.log'
```

### 3. Startup script

Located at: `~/.local/bin/start-qwen-mlx-server.sh`

```bash
ssh m1max-cf 'cat ~/.local/bin/start-qwen-mlx-server.sh'
```

### 4. Install launchd plist

```bash
ssh m1max-cf 'launchctl load ~/Library/LaunchAgents/com.mekong.qwen-server.plist'
# Verify:
ssh m1max-cf 'launchctl list | grep mekong.qwen'
```

---

## Day-to-Day Operations

### Health check

```bash
ssh m1max-cf 'curl -s http://127.0.0.1:11437/v1/models | python3 -m json.tool'
```

### Test inference

```bash
ssh m1max-cf 'curl -s http://127.0.0.1:11437/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '"'"'{"model":"mlx-community/Qwen3-30B-A3B-4bit","messages":[{"role":"user","content":"Reply OK"}],"max_tokens":10}'"'"' | python3 -m json.tool'
```

### RAM check

```bash
ssh m1max-cf 'top -l 1 | grep PhysMem'
# Target: ≤56GB used with both Qwen3 + DeepSeek hot
```

### launchd status

```bash
ssh m1max-cf 'launchctl list | grep mekong.qwen'
# Format: PID  exit_status  label
# PID > 0 = running, PID = "-" = stopped
```

### View logs

```bash
ssh m1max-cf 'tail -50 ~/.local/logs/qwen-mlx.log'
```

---

## Start / Stop / Restart

```bash
# Start
ssh m1max-cf 'launchctl start com.mekong.qwen-server'

# Stop
ssh m1max-cf 'launchctl stop com.mekong.qwen-server'

# Restart
ssh m1max-cf 'launchctl stop com.mekong.qwen-server && sleep 3 && launchctl start com.mekong.qwen-server'

# Manual start (bypass launchd, for debugging)
ssh m1max-cf '~/.local/bin/start-qwen-mlx-server.sh &'
```

---

## Kill Switch (Emergency)

```bash
# Hard kill
ssh m1max-cf 'pkill -f "mlx_lm.server.*11437"'

# Disable auto-restart (prevents launchd from restarting)
ssh m1max-cf 'launchctl unload ~/Library/LaunchAgents/com.mekong.qwen-server.plist'
```

---

## RAM Pressure Escalation

If `memory_pressure` returns **critical** or RAM > 56GB:

```bash
# Option A: Stop Nemotron (port 4001) — saves ~18GB when loaded
ssh m1max-cf 'pkill -f "mlx_lm server.*4001"'

# Option B: Stop DeepSeek (port 4002) — hot-start on demand
ssh m1max-cf 'pkill -f "mlx_lm server.*4002"'

# Check current usage
ssh m1max-cf 'ps aux | grep mlx_lm | grep -v grep | awk "{print \$4\"% MEM   \"\$11,\$12,\$13,\$14}"'
```

---

## Concurrent Server Overview

| Port  | Model                              | launchd label              | Status   |
|-------|------------------------------------|----------------------------|----------|
| 4001  | Nemotron-3-Nano-30B-A3B-4bit       | (manual/legacy)            | hot-idle |
| 4002  | DeepSeek-R1-Distill-Qwen-32B-4bit  | (manual/legacy)            | active   |
| 4003  | Qwen2.5-Coder-7B-Instruct-4bit     | (manual/legacy)            | hot-idle |
| 11437 | Qwen3-30B-A3B-4bit                 | com.mekong.qwen-server     | NEW      |
| 11434 | Ollama (various)                   | homebrew.mxcl.ollama       | optional |

---

## Troubleshooting

### Port 11437 already in use

```bash
ssh m1max-cf 'lsof -i :11437'
# Kill occupying process, then restart launchd service
```

### Download lock stuck

```bash
# Kill all download processes
ssh m1max-cf 'pkill -f "hf download mlx-community/Qwen3"'
ssh m1max-cf 'pkill -f "mlx_lm.convert.*Qwen3"'
# Clear locks via script (avoids .cache path restrictions)
scp /tmp/clear-hf-locks.sh m1max-cf:/tmp/clear-hf-locks.sh
ssh m1max-cf 'chmod +x /tmp/clear-hf-locks.sh && /tmp/clear-hf-locks.sh'
# Restart download
ssh m1max-cf 'nohup /Users/macbook/mlx-env/bin/hf download mlx-community/Qwen3-30B-A3B-4bit > /tmp/qwen3-download.log 2>&1 &'
```

### Server won't start — model not found

```bash
# Verify model downloaded
ssh m1max-cf '/Users/macbook/mlx-env/bin/hf download mlx-community/Qwen3-30B-A3B-4bit --quiet'
```

### Memory swap / thrashing

```bash
ssh m1max-cf 'memory_pressure'
# If "critical": stop Nemotron (port 4001) first, then check again
```

---

## Env Var Reference

Add to `~/.zshrc` on M1 Max:

```bash
export QWEN_SERVER_URL="http://127.0.0.1:11437"
```

Add to algo-trader `.env` (for daemon connectivity, Phase 03):

```
QWEN_SERVER_URL=http://127.0.0.1:11437
QWEN_MODEL=mlx-community/Qwen3-30B-A3B-4bit
```

---

## Phase 04 Admin API — Kill/Unkill & Drawdown Alerts

### Admin Routes (require ADMIN_API_KEY header)

```bash
# Check Qwen status (L1 + L2 flags)
curl -H "X-Admin-Key: $ADMIN_API_KEY" https://algo-trader.pages.dev/api/v1/admin/qwen/status

# L1 Kill switch — immediate halt, daemon signals silently 401
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" https://algo-trader.pages.dev/api/v1/admin/qwen/kill

# L1 Unkill — re-enables kill switch
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" https://algo-trader.pages.dev/api/v1/admin/qwen/unkill

# L2 Re-enable after drawdown auto-disable (manual human action required)
# NOT available via API — requires QWEN_KILL=0 redeploy + admin re-enable
```

### Drawdown Alert Interpretation

When Telegram admin alert fires:
```
[ALERT] Qwen paper drawdown breached: -6.23% (threshold -5%). Auto-disabling Qwen swarm. Manual re-enable required.
```

**Steps:**
1. Check `GET /api/v1/admin/qwen/status` → confirms `qwenEnabled: false`
2. Review `paper_trades_v3` WHERE source='qwen' past 24h
3. If bad signal pattern: rotate `QWEN_INGEST_HMAC_SECRET`, redeploy
4. If market anomaly: wait 24h, then `POST /unkill` to re-enable
5. Update `QWEN_DRAWDOWN_MAX_PCT` if threshold too aggressive (default 5%)

### Prometheus Alert Conditions

- `algo_trader_qwen_paper_pnl_pct < -0.05` → critical (matches L3 auto-disable threshold)
- `algo_trader_qwen_signals_total{result="rejected"}` spike → HMAC secret mismatch or replay attack

---

## Files on M1 Max

| Path | Description |
|------|-------------|
| `~/.local/bin/start-qwen-mlx-server.sh` | Startup script |
| `~/Library/LaunchAgents/com.mekong.qwen-server.plist` | launchd plist |
| `~/.local/logs/qwen-mlx.log` | Combined stdout+stderr log |
| `~/.cache/huggingface/hub/models--mlx-community--Qwen3-30B-A3B-4bit/` | Model weights (~18GB) |
